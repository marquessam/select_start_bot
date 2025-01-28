// achievementFeed.js
const { EmbedBuilder } = require('discord.js');
const raAPI = require('./raAPI');
const DataService = require('./services/dataService');
const { BotError, ErrorHandler } = require('./utils/errorHandler');
const database = require('./database');

class AchievementFeed {
    constructor(client) {
        this.client = client;
        this.feedChannel = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        this.announcementHistory = {
            messageIds: new Set(),
            pointAwards: new Set()  // Track point award announcements
        };
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isInitializing = false;
        this.initializationComplete = false;
        this._processingAchievements = false;
    }

    startPeriodicCheck() {
        setInterval(() => this.checkNewAchievements(), this.checkInterval);
    }

    async retryOperation(operation, retries = 3, delay = 5000) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                const isLastAttempt = attempt === retries;
                // Check if error is "retryable" (network errors, e.g. DNS or ECONNRESET)
                const isRetryableError = error.code === 'EAI_AGAIN' || 
                                       error.name === 'FetchError' ||
                                       error.code === 'ECONNRESET';

                if (isLastAttempt || !isRetryableError) {
                    throw error;
                }

                console.log(
                    `[ACHIEVEMENT FEED] Attempt ${attempt} failed, retrying in ${delay/1000}s:`, 
                    error.message
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async initialize() {
        if (this.isInitializing) {
            console.log('[ACHIEVEMENT FEED] Already initializing, waiting...');
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.isInitializing = true;
        try {
            console.log('[ACHIEVEMENT FEED] Initializing achievement feed...');
            
            // Wait for UserStats to be ready
            if (global.leaderboardCache?.userStats) {
                while (!global.leaderboardCache.userStats.initializationComplete) {
                    console.log('[ACHIEVEMENT FEED] Waiting for UserStats initialization...');
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            // Get initial achievements and stored timestamps
            const [allAchievements, storedTimestamps] = await Promise.all([
                this.retryOperation(async () => {
                    return await raAPI.fetchAllRecentAchievements();
                }),
                database.getLastAchievementTimestamps()
            ]);
            
            // For any users without stored timestamps, use their most recent achievement
            for (const { username, achievements } of allAchievements) {
                if (achievements && achievements.length > 0) {
                    const lastStoredTime = storedTimestamps[username.toLowerCase()];
                    if (!lastStoredTime) {
                        // Store the most recent achievement time as starting point
                        const mostRecentTime = new Date(achievements[0].Date).getTime();
                        await database.updateLastAchievementTimestamp(
                            username.toLowerCase(), 
                            mostRecentTime
                        );
                    }
                }
            }

            this.initializationComplete = true;
            // Start periodic checking
            this.startPeriodicCheck();
            console.log('[ACHIEVEMENT FEED] Achievement feed initialized successfully');
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error initializing achievement feed:', error);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    async queueAnnouncement(messageOptions) {
    this.announcementQueue.push(messageOptions);
    if (!this.isProcessingQueue) {
        await this.processAnnouncementQueue();
    }
}

async processAnnouncementQueue() {
    if (this.isProcessingQueue || this.announcementQueue.length === 0) return;

    this.isProcessingQueue = true;
    try {
        const channel = await this.client.channels.fetch(this.feedChannel);

        while (this.announcementQueue.length > 0) {
            const messageOptions = this.announcementQueue.shift();
            await channel.send(messageOptions);
            // Wait 1 second between announcements to prevent spam
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        console.error('[ACHIEVEMENT FEED] Error processing announcement queue:', error);
    } finally {
        this.isProcessingQueue = false;
    }
}

    async checkNewAchievements() {
        if (this._processingAchievements) {
            console.log('[ACHIEVEMENT FEED] Already processing achievements, skipping...');
            return;
        }

        this._processingAchievements = true;
        try {
            const [allAchievements, storedTimestamps] = await Promise.all([
                this.retryOperation(async () => {
                    return await raAPI.fetchAllRecentAchievements();
                }),
                database.getLastAchievementTimestamps()
            ]);
            
            const channel = await this.client.channels.fetch(this.feedChannel);
            if (!channel) {
                throw new Error('Achievement feed channel not found');
            }

            for (const { username, achievements } of allAchievements) {
                if (!achievements || achievements.length === 0) continue;

                const lastCheckedTime = storedTimestamps[username.toLowerCase()] || 0;
                
                // Sort achievements by date (oldest first)
                const sortedAchievements = [...achievements].sort(
                    (a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime()
                );
                
                // Filter new achievements
                const newAchievements = sortedAchievements.filter(ach => 
                    new Date(ach.Date).getTime() > lastCheckedTime
                );

                // Update timestamp first to prevent duplicates
                if (newAchievements.length > 0) {
                    const latestTime = new Date(
                        sortedAchievements[sortedAchievements.length - 1].Date
                    ).getTime();
                    
                    await database.updateLastAchievementTimestamp(
                        username.toLowerCase(), 
                        latestTime
                    );

                    // Process achievements in order
                    for (const achievement of newAchievements) {
                        await this.sendAchievementNotification(channel, username, achievement);
                        // Add small delay between notifications
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error checking new achievements:', error);
        } finally {
            this._processingAchievements = false;
        }
    }

async sendAchievementNotification(channel, username, achievement) {
    try {
        if (!channel || !username || !achievement) {
            throw new BotError('Missing required data', ErrorHandler.ERROR_TYPES.VALIDATION, 'Announce Achievement');
        }

        const achievementKey = `${username}-${achievement.ID || achievement.AchievementID || achievement.achievementID || achievement.id || Date.now()}-${achievement.GameTitle}-${achievement.Title}`;
        if (this.announcementHistory.messageIds.has(achievementKey)) {
            console.log(`[ACHIEVEMENT FEED] Skipping duplicate achievement: ${username} - ${achievement.Title} in ${achievement.GameTitle}`);
            return;
        }

        // Get current challenge and shadow game for comparison
        const currentChallenge = await database.getCurrentChallenge();
        const shadowGame = await database.getShadowGame();

        // Ensure we're comparing strings for game IDs
        const achievementGameId = String(achievement.GameID || achievement.gameId);
        const monthlyGameId = currentChallenge?.gameId ? String(currentChallenge.gameId) : null;
        const shadowGameId = shadowGame?.finalReward?.gameId ? String(shadowGame.finalReward.gameId) : null;

        // Check if achievement is from monthly challenge or shadow game
        const isMonthlyChallenge = monthlyGameId && achievementGameId === monthlyGameId;
        const isShadowGame = shadowGame?.active && shadowGameId && achievementGameId === shadowGameId;

        // Debug logging
        console.log(`[ACHIEVEMENT FEED] Game ID comparison:
            Achievement Game ID: ${achievementGameId}
            Monthly Game ID: ${monthlyGameId}
            Shadow Game ID: ${shadowGameId}
            Is Monthly: ${isMonthlyChallenge}
            Is Shadow: ${isShadowGame}`);

        const [badgeUrl, userIconUrl] = await Promise.all([
            achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png',
            DataService.getRAProfileImage(username)
        ]);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(`${achievement.GameTitle || 'Game'} 🏆`)
            .setThumbnail(badgeUrl)
            .setDescription(
                `**${username}** earned **${achievement.Title || 'Achievement'}**\n\n` +
                `*${achievement.Description || 'No description available'}*`
            )
            .setFooter({
                text: `Points: ${achievement.Points || '0'} • ${new Date(achievement.Date).toLocaleTimeString()}`,
                iconURL: userIconUrl || `https://retroachievements.org/UserPic/${username}.png`
            })
            .setTimestamp();

        // Message options with the embed
         const messageOptions = {
        files: isMonthlyChallenge || isShadowGame ? [{
            attachment: './logo.png',
            name: 'logo.png',
            width: 100,
            height: 100
        }] : [],
        embeds: []
    };
// Then create embed
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(`${achievement.GameTitle || 'Game'} 🏆`)
        .setThumbnail(badgeUrl)
        .setDescription(
            `**${username}** earned **${achievement.Title || 'Achievement'}**\n\n` +
            `*${achievement.Description || 'No description available'}*`
        )
        .setFooter({
            text: `Points: ${achievement.Points || '0'} • ${new Date(achievement.Date).toLocaleTimeString()}`,
            iconURL: userIconUrl || `https://retroachievements.org/UserPic/${username}.png`
        })
        .setTimestamp();

    messageOptions.embeds.push(embed);
    await this.queueAnnouncement(messageOptions);
        // Add Select Start logo for monthly/shadow achievements
        if (isMonthlyChallenge || isShadowGame) {
            messageOptions.files = [{
                attachment: './logo.png',
                name: 'logo.png'
            }];
        }

        await this.queueAnnouncement(messageOptions);
        this.announcementHistory.messageIds.add(achievementKey);
        
        if (this.announcementHistory.messageIds.size > 1000) {
            this.announcementHistory.messageIds.clear();
        }

        console.log(`[ACHIEVEMENT FEED] Sent ${isMonthlyChallenge ? 'monthly challenge' : isShadowGame ? 'shadow game' : 'regular'} achievement notification for ${username}: ${achievement.Title}`);
    } catch (error) {
        console.error('[ACHIEVEMENT FEED] Error sending achievement notification:', error);
        throw error;
    }
}
    async announcePointsAward(username, points, reason) {
        try {
            if (!this.feedChannel) {
                console.warn('[ACHIEVEMENT FEED] No feedChannel configured for points announcements');
                return;
            }

            // Create unique key for this points award
            const awardKey = `${username}-${points}-${reason}-${Date.now()}`;
            if (this.announcementHistory.pointAwards.has(awardKey)) {
                console.log(`[ACHIEVEMENT FEED] Skipping duplicate points announcement: ${awardKey}`);
                return;
            }

            // Track this announcement before proceeding
            this.announcementHistory.pointAwards.add(awardKey);

            // Get user profile image
            const userProfile = await DataService.getRAProfileImage(username);
            
            // Create points award embed
            const embed = new EmbedBuilder()
                .setColor('#FFD700')  // Gold color for points
                .setAuthor({
                    name: username,
                    iconURL: userProfile || `https://retroachievements.org/UserPic/${username}.png`,
                    url: `https://retroachievements.org/user/${username}`
                })
                .setTitle('🏆 Points Awarded!')
                .setDescription(`**${username}** earned **${points} point${points !== 1 ? 's' : ''}**!\n*${reason}*`)
                .setTimestamp();

            // Queue the announcement
            await this.queueAnnouncement(embed);

            // Clean up old point award history if needed
            if (this.announcementHistory.pointAwards.size > 1000) {
                this.announcementHistory.pointAwards.clear();
            }

            console.log(`[ACHIEVEMENT FEED] Queued points announcement for ${username}: ${points} points (${reason})`);
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error announcing points award:', error);
            // Remove from history if announcement failed
            this.announcementHistory.pointAwards.delete(awardKey);
        }
    }

    // Manual check method (optional)
    async manualCheck() {
        console.log('[ACHIEVEMENT FEED] Manual achievement check initiated');
        await this.checkNewAchievements();
    }
}

module.exports = AchievementFeed;

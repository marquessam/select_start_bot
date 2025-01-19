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
            messageIds: new Set()
        };
    }

    async initialize() {
        try {
            console.log('[ACHIEVEMENT FEED] Initializing achievement feed...');
            
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

            // Start periodic checking
            this.startPeriodicCheck();
            console.log('[ACHIEVEMENT FEED] Achievement feed initialized successfully');
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error initializing achievement feed:', error);
        }
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

    async checkNewAchievements() {
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

                // Update timestamp
                if (newAchievements.length > 0) {
                    const latestTime = new Date(
                        sortedAchievements[sortedAchievements.length - 1].Date
                    ).getTime();
                    await database.updateLastAchievementTimestamp(
                        username.toLowerCase(), 
                        latestTime
                    );

                    // Announce achievements in chronological order
                    for (const achievement of newAchievements) {
                        await this.sendAchievementNotification(channel, username, achievement);
                    }
                }
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error checking new achievements:', error);
        }
    }

    async sendAchievementNotification(channel, username, achievement) {
        if (!channel) {
            throw new BotError('Channel not available', ErrorHandler.ERROR_TYPES.VALIDATION, 'Announce Achievement');
        }
        if (!username || !achievement) {
            throw new BotError('Missing user or achievement data', ErrorHandler.ERROR_TYPES.VALIDATION, 'Announce Achievement');
        }

        const sendWithRetry = async () => {
            try {
                const achievementKey = `${username}-${achievement.ID || achievement.AchievementID || achievement.achievementID || achievement.id || Date.now()}-${achievement.GameTitle}-${achievement.Title}`;
                if (this.announcementHistory.messageIds.has(achievementKey)) {
                    console.log(`[ACHIEVEMENT FEED] Skipping duplicate achievement: ${username} - ${achievement.Title} in ${achievement.GameTitle}`);
                    return;
                }

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
                        iconURL: userIconUrl || `https://retroachievements.org/UserPic/${username}.png` // fallback
                    })
                    .setTimestamp();

                const message = await channel.send({ embeds: [embed] });
                this.announcementHistory.messageIds.add(achievementKey);
                
                if (this.announcementHistory.messageIds.size > 1000) {
                    this.announcementHistory.messageIds.clear();
                }

                console.log(`[ACHIEVEMENT FEED] Sent achievement notification for ${username}: ${achievement.Title}`);
                return message;
            } catch (error) {
                console.error('[ACHIEVEMENT FEED] Error in sendWithRetry:', error);
                throw error;
            }
        };

        try {
            return await this.retryOperation(sendWithRetry);
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error sending achievement notification:', error);
            throw error;
        }
    }

    /**
     * NEW METHOD:
     * Announces point awards (participation, beaten, mastery, etc.) 
     * in the same feed channel.
     */
    async announcePointsAward(username, points, reason) {
        try {
            if (!this.feedChannel) {
                console.warn('[ACHIEVEMENT FEED] No feedChannel configured for points announcements');
                return;
            }

            const channel = await this.client.channels.fetch(this.feedChannel);
            if (!channel) {
                console.error('[ACHIEVEMENT FEED] Could not fetch feed channel for points announcements');
                return;
            }

            // Optional: define a unique key if you want to prevent spammy duplicates
            const messageKey = `${username}-${points}-${reason}-${Date.now()}`;
            if (this.announcementHistory.messageIds.has(messageKey)) {
                console.log(`[ACHIEVEMENT FEED] Skipping duplicate points announcement: ${username}, ${points}, ${reason}`);
                return;
            }

            // Build embed
            const embed = new EmbedBuilder()
                .setColor('#FFFF00')
                .setTitle('Points Awarded')
                .setDescription(`**${username}** has been awarded **${points}** point(s)!\n**Reason**: *${reason}*`)
                .setTimestamp(new Date())
                .setFooter({ text: 'RetroAchievements Bot' });

            const message = await channel.send({ embeds: [embed] });
            // Track to avoid duplicates
            this.announcementHistory.messageIds.add(messageKey);
            if (this.announcementHistory.messageIds.size > 1000) {
                this.announcementHistory.messageIds.clear();
            }

            console.log(`[ACHIEVEMENT FEED] Announced points award for ${username}: ${points} points (${reason})`);
            return message;
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error announcing points award:', error);
        }
    }

    // Optional: a manual trigger
    async manualCheck() {
        console.log('[ACHIEVEMENT FEED] Manual achievement check initiated');
        await this.checkNewAchievements();
    }
}

module.exports = AchievementFeed;

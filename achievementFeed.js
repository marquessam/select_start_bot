// achievementFeed.js
const { EmbedBuilder } = require('discord.js');
const raAPI = require('./raAPI');
const DataService = require('./services/dataService');
const { BotError, ErrorHandler } = require('./utils/errorHandler');

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
                database.getLastAchievementTimestamps.bind(database)() // New method needed in database.js
            ]);
            
            // For any users without stored timestamps, use their most recent achievement
            for (const { username, achievements } of allAchievements) {
                if (achievements && achievements.length > 0) {
                    const lastStoredTime = storedTimestamps[username.toLowerCase()];
                    if (!lastStoredTime) {
                        // Store the most recent achievement time as starting point
                        const mostRecentTime = new Date(achievements[0].Date).getTime();
                        await database.updateLastAchievementTimestamp(username.toLowerCase(), mostRecentTime);
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
                const isRetryableError = error.code === 'EAI_AGAIN' || 
                                       error.name === 'FetchError' ||
                                       error.code === 'ECONNRESET';

                if (isLastAttempt || !isRetryableError) {
                    throw error;
                }

                console.log(`[ACHIEVEMENT FEED] Attempt ${attempt} failed, retrying in ${delay/1000}s:`, error.message);
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
                
                // Sort achievements by date to ensure chronological order
                const sortedAchievements = [...achievements].sort(
                    (a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime()
                );
                
                // Filter and announce new achievements
                const newAchievements = sortedAchievements.filter(ach => 
                    new Date(ach.Date).getTime() > lastCheckedTime
                );

                // Update the timestamp after filtering but before announcing
                if (newAchievements.length > 0) {
                    const latestTime = new Date(sortedAchievements[0].Date).getTime();
                    await database.updateLastAchievementTimestamp(username.toLowerCase(), latestTime);

                    // Send achievement notifications in chronological order
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
                        iconURL: userIconUrl || `https://retroachievements.org/UserPic/${username}.png` // Fallback if DataService fails
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

    // Method to manually check achievements (useful for testing or manual updates)
    async manualCheck() {
        console.log('[ACHIEVEMENT FEED] Manual achievement check initiated');
        await this.checkNewAchievements();
    }
}

module.exports = AchievementFeed;

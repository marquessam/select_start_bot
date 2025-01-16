// achievementFeed.js
const { EmbedBuilder } = require('discord.js');
const raAPI = require('./raAPI');
const DataService = require('./services/dataService');
const { BotError, ErrorHandler } = require('./utils/errorHandler');

class AchievementFeed {
    constructor(client) {
        this.client = client;
        this.feedChannel = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.lastChecked = new Map();
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        this.announcementHistory = {
            messageIds: new Set()
        };
    }

    async initialize() {
        try {
            console.log('[ACHIEVEMENT FEED] Initializing achievement feed...');
            // Get initial achievements for all users to establish baseline
            const allAchievements = await this.retryOperation(async () => {
                return await raAPI.fetchAllRecentAchievements();
            });
            
            // Store the latest achievement timestamp for each user
            for (const { username, achievements } of allAchievements) {
                if (achievements && achievements.length > 0) {
                    this.lastChecked.set(username.toLowerCase(), new Date(achievements[0].Date).getTime());
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
            const allAchievements = await this.retryOperation(async () => {
                return await raAPI.fetchAllRecentAchievements();
            });
            
            const channel = await this.client.channels.fetch(this.feedChannel);
            
            if (!channel) {
                throw new Error('Achievement feed channel not found');
            }

            for (const { username, achievements } of allAchievements) {
                const lastCheckedTime = this.lastChecked.get(username.toLowerCase()) || 0;
                
                // Filter for new achievements
                const newAchievements = achievements.filter(ach => 
                    new Date(ach.Date).getTime() > lastCheckedTime
                );

                // Update last checked time if we have new achievements
                if (newAchievements.length > 0) {
                    this.lastChecked.set(
                        username.toLowerCase(), 
                        new Date(newAchievements[0].Date).getTime()
                    );

                    // Send achievement notifications
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
                const achievementKey = `${username}-${achievement.ID}`;
                if (this.announcementHistory.messageIds.has(achievementKey)) {
                    console.log(`[ACHIEVEMENT FEED] Skipping duplicate achievement announcement: ${achievementKey}`);
                    return;
                }

                const badgeUrl = achievement.BadgeName
                    ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                    : 'https://media.retroachievements.org/Badge/00000.png';
                const userIconUrl = `https://retroachievements.org/UserPic/${username}.png`;

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
                        iconURL: userIconUrl
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

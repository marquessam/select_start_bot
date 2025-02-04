// achievementFeed.js
const { EmbedBuilder } = require('discord.js');

class AchievementFeed {
    constructor(client) {
        this.client = client;
        this.feedChannel = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.checkInterval = 5 * 60 * 1000; // 5 minutes
        this.announcementHistory = new Set();
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isInitializing = false;
        this.initializationComplete = false;
        this._processingAchievements = false;
        this.isPaused = false;
        this.services = null;

        if (!this.feedChannel) {
            console.error('[ACHIEVEMENT FEED] ERROR: ACHIEVEMENT_FEED_CHANNEL not set.');
            throw new Error('ACHIEVEMENT_FEED_CHANNEL env var is required.');
        }
    }

    setServices(services) {
        this.services = services;
        console.log('[ACHIEVEMENT FEED] Services linked:', Object.keys(services));
    }

    async initialize() {
        if (this.isInitializing) {
            console.log('[ACHIEVEMENT FEED] Already initializing...');
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.isInitializing = true;
        try {
            console.log('[ACHIEVEMENT FEED] Initializing...');

            // ===== COMMENT OUT TIMESTAMP STUFF =====
            // const timestamps = await this.services.database.getLastAchievementTimestamps();
            // const users = await this.services.database.getValidUsers();
            // for (const username of users) {
            //     if (!timestamps[username.toLowerCase()]) {
            //         await this.services.database.updateLastAchievementTimestamp(
            //             username.toLowerCase(),
            //             new Date().getTime()
            //         );
            //     }
            // }

            this.startPeriodicCheck();
            this.initializationComplete = true;
            console.log('[ACHIEVEMENT FEED] Initialized successfully.');
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Initialization error:', error);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    startPeriodicCheck() {
        console.log('[ACHIEVEMENT FEED] Starting periodic checks...');
        this.checkNewAchievements()
            .then(() => console.log('[ACHIEVEMENT FEED] Initial check completed'))
            .catch(error => console.error('[ACHIEVEMENT FEED] Initial check failed:', error));

        setInterval(() => {
            console.log('[ACHIEVEMENT FEED] Running periodic check...');
            this.checkNewAchievements()
                .catch(error => console.error('[ACHIEVEMENT FEED] Periodic check failed:', error));
        }, this.checkInterval);

        console.log(
            `[ACHIEVEMENT FEED] Periodic check started with interval: ${this.checkInterval / 1000} seconds`
        );
    }

    /**
     * Bypass timestamp filtering – processes ALL returned achievements every time.
     */
    async checkNewAchievements() {
        if (this._processingAchievements || this.isPaused) return;
        this._processingAchievements = true;

        try {
            // Fetch recent achievements for all valid users
            const allAchievements = await this.services.raAPI.fetchAllRecentAchievements();

            // Instead of comparing to last timestamp, we just process them all
            for (const { username, achievements } of allAchievements) {
                console.log(`[ACHIEVEMENT FEED] ${username} returned ${achievements.length} achievements from RA.`);

                // For each achievement, directly call achievementSystem.processAchievement
                for (const achievement of achievements) {
                    await this.services.achievementSystem.processAchievement(username, achievement);
                }

                // ===== COMMENT OUT TIMESTAMP UPDATES =====
                // if (achievements.length > 0) {
                //     const latestTime = Math.max(...achievements.map(a => new Date(a.Date).getTime()));
                //     await this.services.database.updateLastAchievementTimestamp(username, latestTime);
                // }
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error:', error);
        } finally {
            this._processingAchievements = false;
        }
    }

    // Announcement queue is still here, but it's only for Discord messages (optional).
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
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error processing announcements:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }
    
    async sendAchievementNotification(channel, username, achievement) {
        try {
            if (!channel || !username || !achievement) return;

            const achievementKey = `${username}-${achievement.ID}-${achievement.GameTitle}-${achievement.Title}`;
            if (this.announcementHistory.has(achievementKey)) return;

            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const userIconUrl = await this.services.raAPI.fetchUserProfile(username) ||
                `https://retroachievements.org/UserPic/${username}.png`;

            // Get game configuration for special styling
            const gameId = String(achievement.GameID);
            const gameConfig = this.gameTypes[gameId];
            
            // Set up embed with default or game-specific styling
            const embed = new EmbedBuilder()
                .setColor(gameConfig?.color || '#00FF00')
                .setTitle(`${achievement.GameTitle}`)
                .setThumbnail(badgeUrl)
                .setDescription(
                    `**${username}** earned **${achievement.Title}**\n\n` +
                    `*${achievement.Description || 'No description available'}*`
                )
                .setFooter({ 
                    text: `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`, 
                    iconURL: userIconUrl 
                })
                .setTimestamp();

            // Add game-specific styling
            if (gameConfig) {
                let files = [];
                if (gameConfig.type === 'MONTHLY' || gameConfig.type === 'SHADOW') {
                    files = [{ 
                        attachment: './assets/logo_simple.png',
                        name: 'game_logo.png'
                    }];
                    embed.setAuthor({
                        name: gameConfig.label,
                        iconURL: 'attachment://game_logo.png'
                    });
                }

                await this.queueAnnouncement({ embeds: [embed], files });
            } else {
                await this.queueAnnouncement({ embeds: [embed] });
            }

            this.announcementHistory.add(achievementKey);
            if (this.announcementHistory.size > 1000) this.announcementHistory.clear();

        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error sending notification:', error);
        }
    }
}

module.exports = AchievementFeed;

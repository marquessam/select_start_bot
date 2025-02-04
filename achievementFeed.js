const { EmbedBuilder } = require('discord.js');
const ErrorHandler = require('./utils/errorHandler');

class AchievementFeed {
    constructor(client) {
        this.client = client;
        this.feedChannel = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        this.announcementHistory = new Set();
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isInitializing = false;
        this.initializationComplete = false;
        this._processingAchievements = false;
        this.isPaused = false;
        this.services = null;

        // Game type configurations
        this.gameTypes = {
            // Monthly Challenge Games
            "319": { // Chrono Trigger
                type: 'MONTHLY',
                color: '#00BFFF',
                label: 'MONTHLY CHALLENGE 🏆',
                masteryOnly: true
            },
            "355": { // ALTTP
                type: 'MONTHLY',
                color: '#00BFFF',
                label: 'MONTHLY CHALLENGE 🏆'
            },
            // Shadow Games
            "274": { // UN Squadron
                type: 'SHADOW',
                color: '#FF0000',
                label: 'SHADOW GAME 🌘'
            }
        };

        // Validate feedChannel on initialization
        if (!this.feedChannel) {
            console.error('[ACHIEVEMENT FEED] ERROR: ACHIEVEMENT_FEED_CHANNEL environment variable is not set.');
            throw new Error('ACHIEVEMENT_FEED_CHANNEL environment variable is required.');
        }
    }

    setServices(services) {
        this.services = services;
        console.log('[ACHIEVEMENT FEED] Services linked:', Object.keys(services));
    }

    startPeriodicCheck() {
        console.log('[ACHIEVEMENT FEED] Starting periodic checks...');
        
        // Run an immediate check
        this.checkNewAchievements()
            .then(() => console.log('[ACHIEVEMENT FEED] Initial check completed'))
            .catch(error => console.error('[ACHIEVEMENT FEED] Initial check failed:', error));

        // Set up interval
        setInterval(() => {
            console.log('[ACHIEVEMENT FEED] Running periodic check...');
            this.checkNewAchievements()
                .catch(error => console.error('[ACHIEVEMENT FEED] Periodic check failed:', error));
        }, this.checkInterval);

        console.log(`[ACHIEVEMENT FEED] Periodic check started with interval: ${this.checkInterval / 1000} seconds`);
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

            // Get initial timestamps if needed
            const timestamps = await this.services.database.getLastAchievementTimestamps();
            const users = await this.services.database.getValidUsers();

            // Initialize timestamps for any new users
            for (const username of users) {
                if (!timestamps[username.toLowerCase()]) {
                    await this.services.database.updateLastAchievementTimestamp(
                        username.toLowerCase(),
                        new Date().getTime()
                    );
                }
            }

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

    async checkNewAchievements() {
        if (this._processingAchievements || this.isPaused) {
            console.log('[ACHIEVEMENT FEED] Already processing or paused, skipping...');
            return;
        }

        this._processingAchievements = true;
        try {
            const [allAchievements, storedTimestamps] = await Promise.all([
                this.services.raAPI.fetchAllRecentAchievements(),
                this.services.database.getLastAchievementTimestamps()
            ]);
            
            const channel = await this.client.channels.fetch(this.feedChannel);
            if (!channel) throw new Error('Achievement feed channel not found');

            for (const { username, achievements } of allAchievements) {
                if (!achievements || achievements.length === 0) continue;

                const lastCheckedTime = storedTimestamps[username.toLowerCase()] || 0;
                const newAchievements = achievements
                    .filter(a => new Date(a.Date).getTime() > lastCheckedTime)
                    .sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());

                if (newAchievements.length > 0) {
                    console.log(`[ACHIEVEMENT FEED] Found ${newAchievements.length} new achievements for ${username}`);
                    
                    // Update timestamp first to prevent duplicates
                    const latestTime = new Date(newAchievements[newAchievements.length - 1].Date).getTime();
                    await this.services.database.updateLastAchievementTimestamp(username.toLowerCase(), latestTime);

                    // First announce achievements
                    for (const achievement of newAchievements) {
                        await this.sendAchievementNotification(channel, username, achievement);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // Then check if any are from tracked games and process achievement system points
                    if (this.services?.achievementSystem) {
                        const trackedGames = new Set(Object.keys(this.services.achievementSystem.constructor.Games));
                        const trackedAchievements = newAchievements.filter(a => trackedGames.has(String(a.GameID)));
                        
                        if (trackedAchievements.length > 0) {
                            const currentMonth = new Date().getMonth() + 1;
                            const currentYear = new Date().getFullYear();
                            
                            // Group by game
                            const gameAchievements = {};
                            for (const ach of trackedAchievements) {
                                if (!gameAchievements[ach.GameID]) {
                                    gameAchievements[ach.GameID] = [];
                                }
                                gameAchievements[ach.GameID].push(ach);
                            }

                            // Process each game's achievements
                            for (const [gameId, achievements] of Object.entries(gameAchievements)) {
                                await this.services.achievementSystem.checkUserAchievements(
                                    username,
                                    gameId,
                                    currentMonth,
                                    currentYear
                                );
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error checking achievements:', error);
        } finally {
            this._processingAchievements = false;
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

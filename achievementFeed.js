const { EmbedBuilder } = require('discord.js');
const raAPI = require('./raAPI');
const DataService = require('./services/dataService');
const database = require('./database');

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

        // Game type configurations - Preserve special styling
        this.gameTypes = {
            // Monthly Challenge Games
            "319": { // Chrono Trigger
                type: 'MONTHLY',
                color: '#00BFFF',
                label: 'MONTHLY CHALLENGE 🏆'
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
    }

    setServices(services) {
        this.services = services;
        console.log('[ACHIEVEMENT FEED] Services linked:', Object.keys(services));
    }

    startPeriodicCheck() {
        setInterval(() => this.checkNewAchievements(), this.checkInterval);
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

            // Get achievement data from RetroAchievements API
            const users = await this.database.getValidUsers();
            const gameIds = Object.keys(this.services.achievementSystem.constructor.Games);

            // Initialize last checked times for each user
            for (const username of users) {
                for (const gameId of gameIds) {
                    const gameProgress = await raAPI.fetchCompleteGameProgress(username, gameId);
                    if (gameProgress?.achievements?.length > 0) {
                        await database.updateLastAchievementTimestamp(
                            username.toLowerCase(),
                            new Date().getTime()
                        );
                    }
                }
            }

            this.initializationComplete = true;
            this.startPeriodicCheck();
            console.log('[ACHIEVEMENT FEED] Initialized successfully.');
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Initialization error:', error);
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
            const validUsers = await this.database.getValidUsers();
            const gameIds = Object.keys(this.services.achievementSystem.constructor.Games);
            
            for (const username of validUsers) {
                const lastCheckedTime = await database.getLastAchievementTimestamp(username) || 0;

                for (const gameId of gameIds) {
                    const gameProgress = await raAPI.fetchCompleteGameProgress(username, gameId);
                    if (!gameProgress?.achievements) continue;

                    // Check for new achievements
                    for (const achievement of Object.values(gameProgress.achievements)) {
                        if (new Date(achievement.dateEarned).getTime() > lastCheckedTime) {
                            // Process achievement
                            await this.processNewAchievement(username, gameId, achievement, gameProgress);
                        }
                    }

                    // Update last checked time if we found any new achievements
                    if (Object.values(gameProgress.achievements).some(a => 
                        new Date(a.dateEarned).getTime() > lastCheckedTime
                    )) {
                        await database.updateLastAchievementTimestamp(username, new Date().getTime());
                    }
                }
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error checking achievements:', error);
        } finally {
            this._processingAchievements = false;
        }
    }

    async processNewAchievement(username, gameId, achievement, gameProgress) {
        try {
            // Check if this achievement should trigger a milestone
            const previousHighestAward = await this.getPreviousAward(username, gameId);
            const currentAward = gameProgress.highestAwardKind;

            // If award level has increased, announce milestone
            if (currentAward !== previousHighestAward) {
                await this.announceAchievementMilestone(username, currentAward, gameId);
            }

            // Always announce the individual achievement
            await this.sendAchievementNotification(
                await this.client.channels.fetch(this.feedChannel),
                username,
                {
                    ...achievement,
                    GameID: gameId,
                    GameTitle: gameProgress.title
                }
            );
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error processing new achievement:', error);
        }
    }

    async getPreviousAward(username, gameId) {
        const records = await this.database.getCollection('achievement_records').find({
            username: username.toLowerCase(),
            gameId
        }).toArray();

        if (records.some(r => r.type === 'mastered')) return 'mastered';
        if (records.some(r => r.type === 'beaten')) return 'beaten';
        if (records.some(r => r.type === 'participation')) return 'participation';
        return null;
    }

    async sendAchievementNotification(channel, username, achievement) {
        try {
            if (!channel || !username || !achievement) return;

            const achievementKey = `${username}-${achievement.ID}-${achievement.GameTitle}-${achievement.Title}`;
            if (this.announcementHistory.has(achievementKey)) return;

            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const userIconUrl = await DataService.getRAProfileImage(username) || 
                `https://retroachievements.org/UserPic/${username}.png`;

            // Get game configuration
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

    async announceAchievementMilestone(username, type, gameId, points) {
        try {
            if (this.isPaused) return;

            const game = this.services?.achievementSystem?.getGameConfig(gameId);
            if (!game) return;

            const awardKey = `${username}-${type}-${gameId}-${Date.now()}`;
            if (this.announcementHistory.has(awardKey)) return;

            this.announcementHistory.add(awardKey);

            const userProfile = await DataService.getRAProfileImage(username);
            const gameConfig = this.gameTypes[gameId] || {};
            
            const embed = new EmbedBuilder()
                .setColor(gameConfig.color || '#FFD700')
                .setAuthor({
                    name: username,
                    iconURL: userProfile || `https://retroachievements.org/UserPic/${username}.png`,
                    url: `https://retroachievements.org/user/${username}`
                })
                .setTitle('🏆 Achievement Unlocked!')
                .setDescription(
                    `**${username}** earned **${points} point${points !== 1 ? 's' : ''}**!\n` +
                    `*${game.name} - ${type}*`
                )
                .setTimestamp();

            if (gameConfig.type) {
                embed.addFields({
                    name: gameConfig.label,
                    value: `Achievement Type: ${type}`
                });
            }

            await this.queueAnnouncement({ embeds: [embed] });

        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error announcing achievement milestone:', error);
            this.announcementHistory.delete(awardKey);
        }
    }
}

module.exports = AchievementFeed;

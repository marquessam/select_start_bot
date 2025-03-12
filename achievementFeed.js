const { EmbedBuilder } = require('discord.js');
const raAPI = require('./raAPI');
const DataService = require('./services/dataService');
const database = require('./database');

class AchievementFeed {
    constructor(client) {
        this.client = client;
        this.feedChannel = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.checkInterval = 15 * 60 * 1000; // Check every 15 minutes
        this.announcementHistory = new Set();
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isInitializing = false;
        this.initializationComplete = false;
        this._processingAchievements = false;
        this.isPaused = false;
    }

    setServices(services) {
        this.services = services;
        console.log('[ACHIEVEMENT FEED] Services updated');
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
            
            const [allAchievements, storedTimestamps] = await Promise.all([
                raAPI.fetchAllRecentAchievements(),
                database.getLastAchievementTimestamps()
            ]);

            for (const { username, achievements } of allAchievements) {
                if (achievements.length > 0 && !storedTimestamps[username.toLowerCase()]) {
                    const mostRecentTime = new Date(achievements[0].Date).getTime();
                    await database.updateLastAchievementTimestamp(username.toLowerCase(), mostRecentTime);
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
        if (this._processingAchievements) {
            console.log('[ACHIEVEMENT FEED] Already processing, skipping...');
            return;
        }

        this._processingAchievements = true;
        try {
            // Get current monthly challenge ID - but don't require it for processing
            const currentChallenge = await database.getCurrentChallenge();
            const currentMonthGameId = currentChallenge?.gameId;
            
            if (currentMonthGameId) {
                console.log(`[ACHIEVEMENT FEED] Current monthly game ID: ${currentMonthGameId}`);
            } else {
                console.log('[ACHIEVEMENT FEED] No current monthly challenge found, will still check all achievements');
            }
            
            console.log('[ACHIEVEMENT FEED] Checking recent achievements for all users');
            
            const [allAchievements, storedTimestamps] = await Promise.all([
                raAPI.fetchAllRecentAchievements(),
                database.getLastAchievementTimestamps()
            ]);
            
            const channel = await this.client.channels.fetch(this.feedChannel);
            if (!channel) throw new Error('Achievement feed channel not found');

            for (const { username, achievements } of allAchievements) {
                if (!achievements || achievements.length === 0) continue;

                // No longer filtering by game ID - announce all achievements
                // Just keep track of achievements we haven't seen before
                const relevantAchievements = achievements;
                
                if (relevantAchievements.length === 0) continue;

                const lastCheckedTime = storedTimestamps[username.toLowerCase()] || 0;
                const newAchievements = relevantAchievements
                    .filter(a => new Date(a.Date).getTime() > lastCheckedTime)
                    .sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());

                if (newAchievements.length > 0) {
                    const latestTime = new Date(newAchievements[newAchievements.length - 1].Date).getTime();
                    await database.updateLastAchievementTimestamp(username.toLowerCase(), latestTime);

                    for (const achievement of newAchievements) {
                        await this.sendAchievementNotification(channel, username, achievement);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between notifications
                    }
                }
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error checking achievements:', error);
        } finally {
            this._processingAchievements = false;
        }
    }

    // Helper method to get current monthly game ID
    async getCurrentMonthlyGameId() {
        // First try to get it from the database
        const currentChallenge = await database.getCurrentChallenge();
        if (currentChallenge?.gameId) {
            return currentChallenge.gameId;
        }
        
        // Fallback to configuration
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthlyGames = require('./monthlyGames').monthlyGames;
        const currentGames = monthlyGames[monthKey];
        
        return currentGames?.monthlyGame?.id || null;
    }
    
    // Helper method to get current shadow game ID
    async getCurrentShadowGameId() {
        // First try to get from database
        const shadowGame = await database.getShadowGame();
        if (shadowGame?.finalReward?.gameId) {
            return shadowGame.finalReward.gameId;
        }
        
        // Fallback to configuration
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthlyGames = require('./monthlyGames').monthlyGames;
        const currentGames = monthlyGames[monthKey];
        
        return currentGames?.shadowGame?.id || null;
    }
    
    // Helper method to check if achievement is for current shadow game
    async isForCurrentShadowGame(gameId) {
        const shadowGameId = await this.getCurrentShadowGameId();
        return shadowGameId && String(gameId) === String(shadowGameId);
    }

    async sendAchievementNotification(channel, username, achievement) {
        try {
            if (!channel || !username || !achievement) return;

            const achievementKey = `${username}-${achievement.ID}-${achievement.GameTitle}-${achievement.Title}`;
            if (this.announcementHistory.has(achievementKey)) return;

            console.log(`[ACHIEVEMENT FEED] Processing achievement: ${username} - ${achievement.GameTitle} - ${achievement.Title}`);

            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const userIconUrl = await DataService.getRAProfileImage(username) || 
                `https://retroachievements.org/UserPic/${username}.png`;

            // Special game handling with proper game IDs
            let authorName = '';
            let authorIconUrl = '';
            let files = [];
            let color = '#00FF00';  // Default green color for regular games
            
            const gameId = String(achievement.GameID); // Ensure string comparison
            const currentMonthGameId = String(await this.getCurrentMonthlyGameId());
            const currentShadowGameId = String(await this.getCurrentShadowGameId());

            // Add the logo file for special games
            const logoFile = { 
                attachment: './assets/logo_simple.png',
                name: 'game_logo.png'
            };

            // Now check if this is a monthly or shadow game achievement
            if (gameId === '7181' || gameId === '8181') { // Shadow Game - Monster Rancher Advance 2
                authorName = 'SHADOW GAME 🌘';
                files = [logoFile];
                authorIconUrl = 'attachment://game_logo.png';
                color = '#FFD700';  // Gold color
            } else if (gameId === currentMonthGameId || 
                       gameId === '355' || gameId === '319' || gameId === '11335') { // Monthly Challenge
                authorName = 'MONTHLY CHALLENGE 🏆';
                files = [logoFile];
                authorIconUrl = 'attachment://game_logo.png';
                color = '#00BFFF';  // Blue color
            } else if (gameId === currentShadowGameId) { // Current Shadow Game
                authorName = 'SHADOW GAME 🌘';
                files = [logoFile];
                authorIconUrl = 'attachment://game_logo.png';
                color = '#FFD700';  // Gold color
            }

            // Base elements for the achievement notification
            let gameTitle = achievement.GameTitle;
            let earnedText = `earned ${achievement.Title}`;
            let description = achievement.Description || 'No description available';
            let pointsText = `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`;

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(gameTitle)
                .setThumbnail(badgeUrl)
                .setDescription(`**${username}** ${earnedText}\n\n*${description}*`)
                .setFooter({ 
                    text: pointsText, 
                    iconURL: userIconUrl 
                })
                .setTimestamp();

            if (authorName) {
                embed.setAuthor({ name: authorName, iconURL: authorIconUrl });
            }

            await this.queueAnnouncement({ embeds: [embed], files });
            this.announcementHistory.add(achievementKey);

            if (this.services?.pointsManager) {
                await this.services.pointsManager.processNewAchievements(username, [achievement]);
            }
            
            if (this.announcementHistory.size > 1000) this.announcementHistory.clear();

        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error sending notification:', error);
        }
    }

    async announcePointsAward(username, points, reason) {
        try {
            // Skip if feed is paused
            if (this.isPaused) {
                return;
            }

            if (!this.feedChannel) {
                console.warn('[ACHIEVEMENT FEED] No feedChannel configured for points announcements');
                return;
            }

            const awardKey = `${username}-${points}-${reason}-${Date.now()}`;
            if (this.announcementHistory.has(awardKey)) {
                console.log(`[ACHIEVEMENT FEED] Skipping duplicate points announcement: ${awardKey}`);
                return;
            }

            this.announcementHistory.add(awardKey);

            const userProfile = await DataService.getRAProfileImage(username);
            
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setAuthor({
                    name: username,
                    iconURL: userProfile || `https://retroachievements.org/UserPic/${username}.png`,
                    url: `https://retroachievements.org/user/${username}`
                })
                .setTitle('🏆 Points Awarded!')
                .setDescription(`**${username}** earned **${points} point${points !== 1 ? 's' : ''}**!\n*${reason}*`)
                .setTimestamp();

            await this.queueAnnouncement({ embeds: [embed] });

            console.log(`[ACHIEVEMENT FEED] Queued points announcement for ${username}: ${points} points (${reason})`);
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error announcing points award:', error);
            this.announcementHistory.delete(awardKey);
        }
    }
}

module.exports = AchievementFeed;

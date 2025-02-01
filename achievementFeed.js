const { EmbedBuilder } = require('discord.js');
const raAPI = require('./raAPI');
const DataService = require('./services/dataService');
const database = require('./database');
const fs = require('fs');

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

    async checkNewAchievements() {
        if (this._processingAchievements) {
            console.log('[ACHIEVEMENT FEED] Already processing, skipping...');
            return;
        }

        this._processingAchievements = true;
        try {
            const [allAchievements, storedTimestamps] = await Promise.all([
                raAPI.fetchAllRecentAchievements(),
                database.getLastAchievementTimestamps()
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
                    const latestTime = new Date(newAchievements[newAchievements.length - 1].Date).getTime();
                    await database.updateLastAchievementTimestamp(username.toLowerCase(), latestTime);

                    for (const achievement of newAchievements) {
                        await this.sendAchievementNotification(channel, username, achievement);
                        await new Promise(resolve => setTimeout(resolve, 500));
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

            const userIconUrl = await DataService.getRAProfileImage(username) || `https://retroachievements.org/UserPic/${username}.png`;

            // ✅ Correctly label Monthly Challenge & Shadow Game
            let authorName = '';
            let authorIconUrl = '';
            let files = [];

            if (achievement.GameID === '274') { // Shadow Game
                authorName = 'SHADOW GAME';
                files = [{ attachment: './logo_simple.png', name: 'game_logo.png' }];
                authorIconUrl = 'attachment://game_logo.png';
            } else if (achievement.GameID === '355') { // Monthly Challenge
                authorName = 'MONTHLY CHALLENGE';
                files = [{ attachment: './logo_simple.png', name: 'game_logo.png' }];
                authorIconUrl = 'attachment://game_logo.png';
            } else if (achievement.GameID === '319') { 
                console.log(`[ACHIEVEMENT FEED] Tracking game ID 319, but not labeling it as Monthly Challenge.`);
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`${achievement.GameTitle} 🏆`)
                .setThumbnail(badgeUrl)
                .setDescription(`**${username}** earned **${achievement.Title}**\n\n*${achievement.Description || 'No description available'}*`)
                .setFooter({ text: `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`, iconURL: userIconUrl })
                .setTimestamp();

            if (authorName) {
                embed.setAuthor({ name: authorName, iconURL: authorIconUrl });
            }

            await this.queueAnnouncement({ embeds: [embed], files });
            this.announcementHistory.add(achievementKey);

            if (this.announcementHistory.size > 1000) this.announcementHistory.clear();

            console.log(`[ACHIEVEMENT FEED] Sent achievement notification for ${username}: ${achievement.Title}`);
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error sending notification:', error);
        }
    }
}

module.exports = AchievementFeed;

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
    }

    startPeriodicCheck() {
        setInterval(() => this.checkNewAchievements(), this.checkInterval);
    }

    async retryOperation(operation, retries = 3, delay = 5000) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                if (attempt === retries || !['EAI_AGAIN', 'FetchError', 'ECONNRESET'].includes(error.code)) {
                    throw error;
                }
                console.log(`[ACHIEVEMENT FEED] Retry ${attempt} failed, retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
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
                this.retryOperation(() => raAPI.fetchAllRecentAchievements()),
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
            const [allAchievements, storedTimestamps] = await Promise.all([
                this.retryOperation(() => raAPI.fetchAllRecentAchievements()),
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

            const currentChallenge = await database.getCurrentChallenge();
            const shadowGame = await database.getShadowGame();
            const achievementGameId = String(achievement.GameID);

            const isMonthlyChallenge = currentChallenge?.gameId === achievementGameId;
            const isShadowGame = shadowGame?.active && shadowGame?.finalReward?.gameId === achievementGameId;

            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const userIconUrl = await DataService.getRAProfileImage(username) || `https://retroachievements.org/UserPic/${username}.png`;

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`${achievement.GameTitle} 🏆`)
                .setThumbnail(badgeUrl)
                .setDescription(`**${username}** earned **${achievement.Title}**\n\n*${achievement.Description || 'No description available'}*`)
                .setFooter({ text: `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`, iconURL: userIconUrl })
                .setTimestamp();

            if (isMonthlyChallenge) {
                embed.setAuthor({ name: 'MONTHLY CHALLENGE', iconURL: 'https://example.com/game_logo.png' });
            } else if (isShadowGame) {
                embed.setAuthor({ name: 'SHADOW GAME', iconURL: 'https://example.com/shadow_logo.png' });
            }

            await this.queueAnnouncement({ embeds: [embed] });
            this.announcementHistory.add(achievementKey);

            if (this.announcementHistory.size > 1000) this.announcementHistory.clear();

            console.log(`[ACHIEVEMENT FEED] Sent ${isMonthlyChallenge ? 'monthly challenge' : isShadowGame ? 'shadow game' : 'regular'} achievement notification for ${username}: ${achievement.Title}`);
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error sending notification:', error);
        }
    }
}

module.exports = AchievementFeed;

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

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`${achievement.GameTitle} 🏆`)
                .setThumbnail(badgeUrl)
                .setDescription(`**${username}** earned **${achievement.Title}**\n\n*${achievement.Description || 'No description available'}*`)
                .setFooter({ text: `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`, iconURL: userIconUrl })
                .setTimestamp();

            await this.queueAnnouncement({ embeds: [embed] });
            this.announcementHistory.add(achievementKey);

            if (this.announcementHistory.size > 1000) this.announcementHistory.clear();

            console.log(`[ACHIEVEMENT FEED] Sent achievement notification for ${username}: ${achievement.Title}`);
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error sending notification:', error);
        }
    }

    // ✅ Fix: Re-added `announcePointsAward` function
    async announcePointsAward(username, points, reason) {
        try {
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

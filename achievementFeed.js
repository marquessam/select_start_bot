// achievementFeed.js
const { EmbedBuilder } = require('discord.js');
const raAPI = require('./raAPI');
const DataService = require('./dataService');
const { BotError, ErrorHandler } = require('./errorHandler');

class AchievementFeed {
    constructor(client) {
        this.client = client;
        this.feedChannel = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.lastChecked = new Map();
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        this.announcementHistory = {
            messageIds: new Set(),
            timestamps: [],
            lastAnnouncement: null
        };
        this.COOLDOWN_MS = 2000; // 2 second cooldown between announcements
        this.TIME_WINDOW_MS = 60000; // 1 minute window
        this.MAX_ANNOUNCEMENTS = 30; // Max 30 announcements per minute
    }

    async initialize() {
        try {
            console.log('[ACHIEVEMENT FEED] Initializing achievement feed...');
            // Get initial achievements for all users to establish baseline
            const allAchievements = await raAPI.fetchAllRecentAchievements();
            
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

    async checkNewAchievements() {
        try {
            const allAchievements = await raAPI.fetchAllRecentAchievements();
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

        try {
            const achievementKey = `${username}-${achievement.ID}`;
            if (this.announcementHistory.messageIds.has(achievementKey)) {
                console.log(`[ACHIEVEMENT FEED] Skipping duplicate achievement announcement: ${achievementKey}`);
                return;
            }

            const currentTime = Date.now();
            if (this.announcementHistory.lastAnnouncement) {
                const timeSinceLastAnnouncement = currentTime - this.announcementHistory.lastAnnouncement;
                if (timeSinceLastAnnouncement < this.COOLDOWN_MS) {
                    await new Promise(resolve => 
                        setTimeout(resolve, this.COOLDOWN_MS - timeSinceLastAnnouncement)
                    );
                }
            }

            this.announcementHistory.timestamps = this.announcementHistory.timestamps.filter(
                timestamp => currentTime - timestamp < this.TIME_WINDOW_MS
            );

            if (this.announcementHistory.timestamps.length >= this.MAX_ANNOUNCEMENTS) {
                console.warn(`[ACHIEVEMENT FEED] Rate limit hit - queuing announcement for ${username}`);
                setTimeout(() => this.sendAchievementNotification(channel, username, achievement), 
                          this.TIME_WINDOW_MS / this.MAX_ANNOUNCEMENTS);
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
            
            this.announcementHistory.timestamps.push(currentTime);
            this.announcementHistory.messageIds.add(achievementKey);
            this.announcementHistory.lastAnnouncement = currentTime;
            
            if (this.announcementHistory.messageIds.size > 1000) {
                this.announcementHistory.messageIds.clear();
            }

            console.log(`[ACHIEVEMENT FEED] Sent achievement notification for ${username}: ${achievement.Title}`);
            return message;
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

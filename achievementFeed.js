const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { ErrorHandler, BotError } = require('./utils/errorHandler');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class AchievementFeed {
    constructor(client, database) {
        this.client = client;
        this.database = database;
        this.channelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.lastAchievements = new Map(); // key: username, value: set of earned achievement IDs
        
        // Check interval
        this.checkInterval = 10 * 60 * 1000; // 10 minutes
        this.channel = null;
        this.intervalHandle = null;

        // Rate limiting
        this.MAX_ANNOUNCEMENTS = 5;  // Max 5 announcements
        this.TIME_WINDOW_MS = 60 * 1000;  // per 60 seconds
        this.COOLDOWN_MS = 3 * 1000;  // 3 second cooldown between announcements
        
        this.announcementHistory = {
            timestamps: [],
            messageIds: new Set(),
            lastAnnouncement: null
        };

        this.errorCount = 0;
        this.lastError = null;
        this.maxErrors = 5;
        this.errorResetInterval = 30 * 60 * 1000;
    }

    async initialize() {
        try {
            const channel = await this.client.channels.fetch(this.channelId);
            if (!channel) {
                throw new Error('Channel not found');
            }

            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions?.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.EmbedLinks
            ])) {
                throw new Error('Missing required permissions');
            }

            this.channel = channel;
            await this.loadInitialAchievements();

            this.intervalHandle = setInterval(() => {
                this.checkNewAchievements().catch(err => {
                    console.error('Achievement Feed Check Error:', err);
                });
            }, this.checkInterval);

            console.log('AchievementFeed: Initialized successfully');
            return true;
        } catch (error) {
            console.error('Achievement Feed Init Error:', error);
            return false;
        }
    }

    async loadInitialAchievements() {
        try {
            const validUsers = await this.database.getValidUsers();
            
            for (const username of validUsers) {
                try {
                    const recentAchievements = await this.fetchUserRecentAchievements(username);
                    const earnedAchievementIds = recentAchievements
                        .filter(ach => parseInt(ach.DateEarned, 10) > 0)
                        .map(ach => ach.ID);

                    this.lastAchievements.set(username.toLowerCase(), new Set(earnedAchievementIds));
                } catch (error) {
                    console.error(`Error loading achievements for ${username}:`, error);
                }
            }
        } catch (error) {
            console.error('Load Initial Achievements Error:', error);
        }
    }

    async fetchUserRecentAchievements(username) {
        try {
            const params = new URLSearchParams({
                z: process.env.RA_USERNAME,
                y: process.env.RA_API_KEY,
                u: username,
                c: 50
            });

            const response = await fetch(`https://retroachievements.org/API/API_GetUserRecentAchievements.php?${params}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch achievements: ${response.statusText}`);
            }
            
            const data = await response.json();
            return data || [];
        } catch (error) {
            console.error(`Error fetching achievements for ${username}:`, error);
            return [];
        }
    }

    async checkNewAchievements() {
        if (!this.channel) {
            console.error('No valid channel to post in');
            return;
        }

        try {
            const validUsers = await this.database.getValidUsers();

            for (const username of validUsers) {
                try {
                    const recentAchievements = await this.fetchUserRecentAchievements(username);
                    const previouslyEarned = this.lastAchievements.get(username.toLowerCase()) || new Set();
                    const currentEarned = new Set();

                    for (const achievement of recentAchievements) {
                        const earnedDate = parseInt(achievement.DateEarned, 10);
                        
                        if (earnedDate > 0) {
                            currentEarned.add(achievement.ID);

                            if (!previouslyEarned.has(achievement.ID)) {
                                await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
                                await this.announceAchievement(username, achievement);
                            }
                        }
                    }

                    this.lastAchievements.set(username.toLowerCase(), currentEarned);
                } catch (error) {
                    console.error(`Error processing achievements for ${username}:`, error);
                }
            }
        } catch (error) {
            console.error('Check Achievements Error:', error);
        }
    }

    async announceAchievement(username, achievement) {
        if (!this.channel || !username || !achievement) return;

        try {
            const achievementKey = `${username}-${achievement.ID}`;
            if (this.announcementHistory.messageIds.has(achievementKey)) {
                return;
            }

            // Rate limiting
            const currentTime = Date.now();
            if (this.announcementHistory.lastAnnouncement) {
                const timeSinceLastAnnouncement = currentTime - this.announcementHistory.lastAnnouncement;
                if (timeSinceLastAnnouncement < this.COOLDOWN_MS) {
                    await new Promise(resolve => setTimeout(resolve, this.COOLDOWN_MS - timeSinceLastAnnouncement));
                }
            }

            this.announcementHistory.timestamps = this.announcementHistory.timestamps
                .filter(timestamp => currentTime - timestamp < this.TIME_WINDOW_MS);

            if (this.announcementHistory.timestamps.length >= this.MAX_ANNOUNCEMENTS) {
                setTimeout(() => this.announceAchievement(username, achievement), 
                    this.TIME_WINDOW_MS / this.MAX_ANNOUNCEMENTS);
                return;
            }

            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const userIconUrl = `https://retroachievements.org/UserPic/${username}.png`;

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Achievement Unlocked! 🏆')
                .setThumbnail(badgeUrl)
                .setDescription(
                    `**${username}** earned **${achievement.Title || 'Achievement'}**\n` +
                    `*${achievement.Description || 'No description available'}*\n\n` +
                    `**Game:** ${achievement.GameTitle || achievement.GameName || 'Unknown Game'}\n` +
                    `**Points:** ${achievement.Points || '0'}`
                )
                .setFooter({
                    text: `Earned at ${new Date(parseInt(achievement.DateEarned) * 1000).toLocaleString()}`,
                    iconURL: userIconUrl
                })
                .setTimestamp();

            const message = await this.channel.send({ embeds: [embed] });
            
            this.announcementHistory.timestamps.push(currentTime);
            this.announcementHistory.messageIds.add(achievementKey);
            this.announcementHistory.lastAnnouncement = currentTime;

            if (this.announcementHistory.messageIds.size > 1000) {
                this.announcementHistory.messageIds.clear();
            }
        } catch (error) {
            console.error('Announce Achievement Error:', error);
        }
    }

    stopFeed() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
            console.log('AchievementFeed: Stopped checking for new achievements');
        }
    }
}

module.exports = AchievementFeed;

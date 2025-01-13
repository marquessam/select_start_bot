const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { logError } = require('./utils/errorHandler');
const raAPI = require('./raAPI');

class AchievementFeed {
    constructor(client, database) {
        this.client = client;
        this.database = database;
        this.channelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.lastAchievements = new Map();
        
        // Check interval
        this.checkInterval = 5 * 60 * 1000; // 5 minutes
        this.channel = null;
        this.intervalHandle = null;

        // Discord Rate Limiting
        this.MAX_ANNOUNCEMENTS = 5;
        this.TIME_WINDOW_MS = 60 * 1000;
        this.COOLDOWN_MS = 3 * 1000;
        
        this.announcementHistory = {
            timestamps: [],
            messageIds: new Set(),
            lastAnnouncement: null
        };
    }

    async initialize() {
        try {
            console.log('Initializing Achievement Feed...');
            const channel = await this.client.channels.fetch(this.channelId);
            if (!channel) {
                throw new Error('Achievement Feed channel not found');
            }

            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions?.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.EmbedLinks
            ])) {
                throw new Error('Missing required permissions for Achievement Feed channel');
            }

            this.channel = channel;
            console.log('Achievement Feed channel found:', this.channelId);

            await this.loadInitialAchievements();

            this.intervalHandle = setInterval(() => {
                this.checkNewAchievements().catch(err => {
                    console.error('Achievement Feed Check Error:', err);
                });
            }, this.checkInterval);

            console.log('Achievement Feed initialized successfully');
            return true;
        } catch (error) {
            console.error('Achievement Feed Init Error:', error);
            return false;
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

            const url = `https://retroachievements.org/API/API_GetUserRecentAchievements.php?${params}`;
            const data = await rateLimiter.makeRequest(url);
            return data || [];
        } catch (error) {
            logError(error, `Achievement Fetch: ${username}`);
            return [];
        }
    }

    async loadInitialAchievements() {
        try {
            const validUsers = await this.database.getValidUsers();
            console.log(`Loading initial achievements for ${validUsers.length} users...`);
            
            const recentResults = await raAPI.fetchAllRecentAchievements();
            
            for (const userResult of recentResults) {
                try {
                    const earnedAchievementIds = userResult.achievements
                        .filter(ach => parseInt(ach.DateEarned, 10) > 0)
                        .map(ach => ach.ID);

                    this.lastAchievements.set(userResult.username.toLowerCase(), new Set(earnedAchievementIds));
                    console.log(`Loaded ${earnedAchievementIds.length} achievements for ${userResult.username}`);
                } catch (error) {
                    logError(error, `Achievement Load: ${userResult.username}`);
                }
            }
        } catch (error) {
            logError(error, 'Load Initial Achievements');
        }
    }

    async checkNewAchievements() {
        if (!this.channel) {
            logError(new Error('No valid channel to post in'), 'Achievement Feed Channel');
            return;
        }

        console.log('Starting achievement check...');

        try {
            const recentResults = await raAPI.fetchAllRecentAchievements();
            console.log(`Checking achievements for ${recentResults.length} users`);

            for (const userResult of recentResults) {
                try {
                    console.log(`Checking achievements for user: ${userResult.username}`);
                    const recentAchievements = userResult.achievements;
                    
                    if (!Array.isArray(recentAchievements)) {
                        console.log(`No achievements found for ${userResult.username}`);
                        continue;
                    }

                    console.log(`Found ${recentAchievements.length} achievements for ${userResult.username}`);
                    const previouslyEarned = this.lastAchievements.get(userResult.username.toLowerCase()) || new Set();
                    const currentEarned = new Set();

                    for (const achievement of recentAchievements) {
                        const earnedDate = parseInt(achievement.DateEarned, 10);
                        
                        if (earnedDate > 0) {
                            currentEarned.add(achievement.ID);

                            if (!previouslyEarned.has(achievement.ID)) {
                                console.log(`New achievement found for ${userResult.username}: ${achievement.Title}`);
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                await this.announceAchievement(userResult.username, achievement);
                            }
                        }
                    }

                    this.lastAchievements.set(userResult.username.toLowerCase(), currentEarned);
                } catch (error) {
                    logError(error, `Achievement Process: ${userResult.username}`);
                }
            }
        } catch (error) {
            logError(error, 'Check Achievements');
        }
    }


    async announceAchievement(username, achievement) {
        console.log('Attempting to announce achievement:', {
            username,
            achievementTitle: achievement.Title,
            achievementID: achievement.ID
        });

        if (!this.channel || !username || !achievement) {
            console.log('Missing required data:', {
                hasChannel: !!this.channel,
                hasUsername: !!username,
                hasAchievement: !!achievement
            });
            return;
        }

        try {
            const achievementKey = `${username}-${achievement.ID}`;
            if (this.announcementHistory.messageIds.has(achievementKey)) {
                console.log('Achievement already announced:', achievementKey);
                return;
            }

            const currentTime = Date.now();
            if (this.announcementHistory.lastAnnouncement) {
                const timeSinceLastAnnouncement = currentTime - this.announcementHistory.lastAnnouncement;
                if (timeSinceLastAnnouncement < this.COOLDOWN_MS) {
                    console.log('Waiting for cooldown:', {
                        timeToWait: this.COOLDOWN_MS - timeSinceLastAnnouncement
                    });
                    await new Promise(resolve => setTimeout(resolve, this.COOLDOWN_MS - timeSinceLastAnnouncement));
                }
            }

            this.announcementHistory.timestamps = this.announcementHistory.timestamps
                .filter(timestamp => currentTime - timestamp < this.TIME_WINDOW_MS);

            if (this.announcementHistory.timestamps.length >= this.MAX_ANNOUNCEMENTS) {
                console.log('Rate limit reached, queueing announcement');
                setTimeout(() => this.announceAchievement(username, achievement), 
                    this.TIME_WINDOW_MS / this.MAX_ANNOUNCEMENTS);
                return;
            }

            console.log('Building achievement embed...');
            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const userIconUrl = `https://retroachievements.org/UserPic/${username}.png`;
            const earnedDate = new Date(parseInt(achievement.DateEarned) * 1000);
            
            // Generate achievement URL
            const achievementUrl = `https://retroachievements.org/achievement/${achievement.ID}`;

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Achievement Unlocked! 🏆')
                .setThumbnail(badgeUrl)
                .setDescription(
                    `**${username}** earned **[${achievement.Title || 'Achievement'}](${achievementUrl})**\n` +
                    `*${achievement.Description || 'No description available'}*\n\n` +
                    `**Game:** ${achievement.GameTitle || achievement.GameName || 'Unknown Game'}\n` +
                    `**Points:** ${achievement.Points || '0'}`
                )
                .setFooter({
                    text: `Earned at ${earnedDate.toLocaleString()}`,
                    iconURL: userIconUrl
                })
                .setTimestamp();

            console.log('Sending announcement to channel...');
            const message = await this.channel.send({ embeds: [embed] });
            console.log('Announcement sent successfully');
            
            this.announcementHistory.timestamps.push(currentTime);
            this.announcementHistory.messageIds.add(achievementKey);
            this.announcementHistory.lastAnnouncement = currentTime;

            if (this.announcementHistory.messageIds.size > 1000) {
                this.announcementHistory.messageIds.clear();
            }
        } catch (error) {
            console.error('Failed to announce achievement:', error);
            logError(error, `Achievement Announce: ${username}`);
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

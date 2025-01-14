const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { logError } = require('./utils/errorHandler');
const raAPI = require('./raAPI');

class AchievementFeed {
    constructor(client, database) {
        this.client = client;
        this.database = database;
        this.channelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
        
        // Check interval
        this.checkInterval = 5 * 60 * 1000; // 5 minutes
        this.channel = null;
        this.intervalHandle = null;

        // Track last checked achievements for each user
        this.lastAchievements = new Map();
        // Track announced achievements to avoid duplicates
        this.announcedAchievements = new Set();
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

            // Load initial state
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

    async loadInitialAchievements() {
        try {
            console.log('Loading initial achievements state...');
            const recentResults = await raAPI.fetchAllRecentAchievements();
            
            for (const userResult of recentResults) {
                if (!Array.isArray(userResult.achievements)) continue;
                
                const achievementIds = new Set(
                    userResult.achievements.map(ach => ach.ID)
                );
                this.lastAchievements.set(userResult.username.toLowerCase(), achievementIds);
                console.log(`Stored ${achievementIds.size} achievement IDs for ${userResult.username}`);
            }
        } catch (error) {
            console.error('Error loading initial achievements:', error);
        }
    }

    async checkNewAchievements() {
        if (!this.channel) {
            console.error('No valid channel to post in');
            return;
        }

        console.log('Starting achievement check...');
        try {
            const recentResults = await raAPI.fetchAllRecentAchievements();
            console.log(`Checking achievements for ${recentResults.length} users`);

            for (const userResult of recentResults) {
                try {
                    console.log(`Checking achievements for user: ${userResult.username}`);
                    const achievements = userResult.achievements;
                    
                    if (!Array.isArray(achievements)) {
                        console.log(`No achievements found for ${userResult.username}`);
                        continue;
                    }

                    const username = userResult.username.toLowerCase();
                    const previousAchievements = this.lastAchievements.get(username) || new Set();
                    const currentAchievements = new Set(achievements.map(ach => ach.ID));

                    // Find achievements that weren't in the previous set
                    for (const achievement of achievements) {
                        if (!previousAchievements.has(achievement.ID)) {
                            console.log(`New achievement found for ${userResult.username}:`, {
                                title: achievement.Title,
                                game: achievement.GameTitle || achievement.GameName
                            });

                            const achievementKey = `${username}-${achievement.ID}`;
                            if (!this.announcedAchievements.has(achievementKey)) {
                                await this.announceAchievement(userResult.username, achievement);
                            }
                        }
                    }

                    // Update stored achievements for next check
                    this.lastAchievements.set(username, currentAchievements);

                } catch (error) {
                    console.error(`Error processing achievements for ${userResult.username}:`, error);
                }
            }
        } catch (error) {
            console.error('Check Achievements Error:', error);
        }
    }

    async announceAchievement(username, achievement) {
        if (!this.channel || !username || !achievement) {
            console.log('Missing required data for announcement');
            return;
        }

        const achievementKey = `${username}-${achievement.ID}`;
        if (this.announcedAchievements.has(achievementKey)) {
            console.log('Achievement already announced:', achievementKey);
            return;
        }

        try {
            console.log('Building announcement for:', {
                username,
                achievement: achievement.Title,
                game: achievement.GameTitle || achievement.GameName
            });

            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const userIconUrl = `https://retroachievements.org/UserPic/${username}.png`;
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
                    text: `Achievement Feed`,
                    iconURL: userIconUrl
                })
                .setTimestamp();

            console.log('Sending achievement announcement to channel...');
            await this.channel.send({ embeds: [embed] });
            console.log('Successfully announced achievement');
            
            this.announcedAchievements.add(achievementKey);
        } catch (error) {
            console.error('Failed to announce achievement:', error);
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

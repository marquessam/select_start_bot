const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { fetchLeaderboardData } = require('./raAPI');

class AchievementFeed {
    constructor(client, database) {
        this.client = client;
        this.database = database;
        this.channelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.lastAchievements = new Map();
        this.checkInterval = 5 * 60 * 1000;
        this.channel = null; // Store channel reference
    }

    async initialize() {
        try {
            // Validate and set up channel
            const channel = await this.client.channels.fetch(this.channelId);
            if (!channel) {
                console.error('Achievement feed channel not found');
                return false;
            }

            // Check permissions
            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions || !permissions.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.EmbedLinks
            ])) {
                console.error('Missing required permissions in achievement feed channel');
                return false;
            }

            // Store channel reference
            this.channel = channel;

            // Get initial achievement states
            const data = await fetchLeaderboardData();
            if (data?.leaderboard) {
                for (const user of data.leaderboard) {
                    if (user.achievements) {
                        this.lastAchievements.set(user.username.toLowerCase(), new Set(
                            user.achievements
                                .filter(ach => parseInt(ach.DateEarned) > 0)
                                .map(ach => ach.ID)
                        ));
                    }
                }
            }

            // Start periodic checking
            setInterval(() => this.checkNewAchievements(), this.checkInterval);
            console.log('Achievement Feed initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing Achievement Feed:', error);
            return false;
        }
    }

    async checkNewAchievements() {
        try {
            // Check if channel is still valid
            if (!this.channel) {
                console.error('Achievement feed channel not available');
                return;
            }

            const data = await fetchLeaderboardData();
            if (!data?.leaderboard) return;

            for (const user of data.leaderboard) {
                if (!user.achievements) continue;

                const previousAchievements = this.lastAchievements.get(user.username.toLowerCase()) || new Set();
                const currentAchievements = new Set();

                for (const achievement of user.achievements) {
                    if (parseInt(achievement.DateEarned) > 0) {
                        currentAchievements.add(achievement.ID);

                        // Check if this is a new achievement
                        if (!previousAchievements.has(achievement.ID)) {
                            await this.announceAchievement(user.username, achievement)
                                .catch(error => console.error(`Failed to announce achievement for ${user.username}:`, error));
                        }
                    }
                }

                // Update stored achievements
                this.lastAchievements.set(user.username.toLowerCase(), currentAchievements);
            }
        } catch (error) {
            console.error('Error checking achievements:', error);
        }
    }

    async announceAchievement(username, achievement) {
        try {
            if (!this.channel) {
                throw new Error('Channel not available');
            }

            // Safety checks for required data
            if (!username || !achievement) {
                throw new Error('Missing required achievement data');
            }

            // Validate and format URLs with error handling
            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png'; // Default badge

            const userIconUrl = username
                ? `https://retroachievements.org/UserPic/${username}.png`
                : 'https://retroachievements.org/UserPic/default.png'; // Default user icon

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Achievement Unlocked! 🏆')
                .setThumbnail(badgeUrl)
                .setDescription(
                    `**${username}** earned **${achievement.Title || 'Achievement'}**\n` +
                    `*${achievement.Description || 'No description available'}*`
                )
                .setFooter({ 
                    text: `Points: ${achievement.Points || '0'}`,
                    iconURL: userIconUrl
                })
                .setTimestamp();

            console.log('Announcing achievement for:', username, achievement.Title);
            
            // Attempt to send the embed with error handling
            try {
                await this.channel.send({ embeds: [embed] });
            } catch (sendError) {
                if (sendError.code === 50013) { // Missing Permissions
                    console.error('Bot lacks permissions to send messages in achievement feed channel');
                } else {
                    throw sendError; // Re-throw other errors
                }
            }
        } catch (error) {
            console.error('Error announcing achievement:', error);
            throw error; // Propagate error for handling in checkNewAchievements
        }
    }
}

module.exports = AchievementFeed;

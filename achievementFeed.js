const { EmbedBuilder } = require('discord.js');
const { fetchLeaderboardData } = require('./raAPI');

class AchievementFeed {
    constructor(client, database) {
        this.client = client;
        this.database = database;
        this.channelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.lastAchievements = new Map(); // Store last known achievements per user
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
    }

    async initialize() {
        try {
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
            console.log('Achievement Feed initialized');
            return true;
        } catch (error) {
            console.error('Error initializing Achievement Feed:', error);
            return false;
        }
    }

    async checkNewAchievements() {
        try {
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
                            await this.announceAchievement(user.username, achievement);
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
            const channel = await this.client.channels.fetch(this.channelId);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Achievement Unlocked! 🏆')
                .setThumbnail(`https://retroachievements.org${achievement.BadgeName}`)
                .setDescription(`**${username}** earned **${achievement.Title}**\n*${achievement.Description}*`)
                .setFooter({ 
                    text: `Points: ${achievement.Points}`,
                    iconURL: `https://retroachievements.org/UserPic/${username}.png`
                })
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error announcing achievement:', error);
        }
    }
}

module.exports = AchievementFeed;

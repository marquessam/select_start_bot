// achievementFeed.js
const TerminalEmbed = require('./utils/embedBuilder');
const raAPI = require('./raAPI');
const DataService = require('./utils/dataService');

class AchievementFeed {
    constructor(client) {
        this.client = client;
        this.feedChannel = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.lastChecked = new Map();
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
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
        try {
            const profile = await raAPI.fetchUserProfile(username);
            const embed = new TerminalEmbed()
                .setTerminalTitle('Achievement Unlocked!')
                .setTerminalDescription(
                    `${username} has unlocked an achievement in ${achievement.GameTitle}!`
                )
                .addTerminalField(
                    achievement.Title,
                    achievement.Description
                )
                .addTerminalField(
                    'Points',
                    `${achievement.Points} points`
                )
                .setTerminalThumbnail(profile.profileImage)
                .setImage(`https://retroachievements.org${achievement.BadgeURL}`)
                .setTerminalFooter();

            await channel.send({ embeds: [embed] });
            console.log(`[ACHIEVEMENT FEED] Sent achievement notification for ${username}: ${achievement.Title}`);
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error sending achievement notification:', error);
        }
    }

    // Method to manually check achievements (useful for testing or manual updates)
    async manualCheck() {
        console.log('[ACHIEVEMENT FEED] Manual achievement check initiated');
        await this.checkNewAchievements();
    }
}

module.exports = AchievementFeed;

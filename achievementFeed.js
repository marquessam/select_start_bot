const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { fetchLeaderboardData } = require('./raAPI');

class AchievementFeed {
    constructor(client, database) {
        this.client = client;
        this.database = database;

        this.channelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.lastAchievements = new Map(); // key: username, value: set of earned achievement IDs

        // Check achievements every 5 minutes (default)
        this.checkInterval = 5 * 60 * 1000; 
        this.channel = null;
        this.intervalHandle = null;

        // === RATE LIMITING SETTINGS ===
        // e.g., max 5 announcements per 60 seconds
        this.MAX_ANNOUNCEMENTS = 5; 
        this.TIME_WINDOW_MS = 60 * 1000; 

        // Timestamps of recent announcements
        this.announcementTimestamps = [];
    }

    async initialize() {
        try {
            // Validate channel
            const channel = await this.client.channels.fetch(this.channelId);
            if (!channel) {
                console.error('AchievementFeed: Channel not found');
                return false;
            }

            // Check permissions
            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions?.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.EmbedLinks
            ])) {
                console.error('AchievementFeed: Missing required permissions in feed channel');
                return false;
            }

            this.channel = channel;

            // Initial load of achievements
            await this.loadInitialAchievements();

            // Set up periodic checks
            this.intervalHandle = setInterval(() => {
                this.checkNewAchievements().catch(err => {
                    console.error('AchievementFeed: Error in scheduled check:', err);
                });
            }, this.checkInterval);

            console.log('AchievementFeed: Initialized successfully');
            return true;
        } catch (error) {
            console.error('AchievementFeed: Error initializing feed:', error);
            return false;
        }
    }

    async loadInitialAchievements() {
        const data = await fetchLeaderboardData();
        if (!data?.leaderboard) return;

        for (const user of data.leaderboard) {
            if (!user.achievements) continue;

            const earnedAchievementIds = user.achievements
                .filter(ach => parseInt(ach.DateEarned, 10) > 0)
                .map(ach => ach.ID);

            this.lastAchievements.set(
                user.username.toLowerCase(),
                new Set(earnedAchievementIds)
            );
        }
    }

    async checkNewAchievements() {
    // Ensure we still have a valid channel
    if (!this.channel) {
        console.error('AchievementFeed: No valid channel to post in');
        return;
    }

    try {
        const data = await fetchLeaderboardData();
        if (!data?.leaderboard) return;

        // Process each user's achievements with built-in delay to avoid race conditions
        for (const user of data.leaderboard) {
            if (!user.achievements) continue;

            const userKey = user.username.toLowerCase();
            const previouslyEarned = this.lastAchievements.get(userKey) || new Set();
            const currentEarned = new Set();

            // Track current achievements and check for new ones
            for (const ach of user.achievements) {
                const earnedDate = parseInt(ach.DateEarned, 10);
                
                // If achievement is earned
                if (earnedDate > 0) {
                    currentEarned.add(ach.ID);

                    // Check if it's newly earned since our last check
                    if (!previouslyEarned.has(ach.ID)) {
                        try {
                            // Add small delay between announcements to prevent rate limiting
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            await this.announceAchievement(user.username, ach);
                        } catch (err) {
                            console.error(
                                `AchievementFeed: Failed to announce achievement for ${user.username}:`,
                                err
                            );
                        }
                    }
                }
            }

            // Update stored achievements for this user
            this.lastAchievements.set(userKey, currentEarned);
        }
    } catch (error) {
        console.error('AchievementFeed: Error checking achievements:', error);
    }
}

    /**
     * Main announcement method, includes rate-limiting check.
     */
    async announceAchievement(username, achievement) {
        if (!this.channel) {
            throw new Error('AchievementFeed: Channel not available');
        }
        if (!username || !achievement) {
            throw new Error('AchievementFeed: Missing user or achievement data');
        }

        // ====================
        // Rate Limiting Logic
        // ====================
        const now = Date.now();

        // Remove timestamps older than TIME_WINDOW_MS
        this.announcementTimestamps = this.announcementTimestamps.filter(
            (timestamp) => now - timestamp < this.TIME_WINDOW_MS
        );

        // If we're at max announcements in this window, skip to avoid spam
        if (this.announcementTimestamps.length >= this.MAX_ANNOUNCEMENTS) {
            console.warn(`AchievementFeed: Rate limit hit - skipping announcement for ${username}`);
            return;
        }

        // Otherwise, record this announcement
        this.announcementTimestamps.push(now);

        // Build URLs
        const badgeUrl = achievement.BadgeName
            ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
            : 'https://media.retroachievements.org/Badge/00000.png';

        const userIconUrl = `https://retroachievements.org/UserPic/${username}.png`;

        // Construct the embed
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

        // Attempt to send
        try {
            await this.channel.send({ embeds: [embed] });
        } catch (sendError) {
            if (sendError.code === 50013) {
                // Missing Permissions
                console.error('AchievementFeed: Bot lacks permissions to send messages in feed channel');
            } else {
                throw sendError;
            }
        }
    }

    /**
     * Optional: If you need to stop checking for achievements (e.g., shutdown),
     * call this to clear the interval.
     */
    stopFeed() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
            console.log('AchievementFeed: Stopped checking for new achievements');
        }
    }
}

module.exports = AchievementFeed;

import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { fetchLeaderboardData } from './raAPI.js';

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
        if (!this.channel) {
            console.error('AchievementFeed: No valid channel to post in');
            return;
        }

        try {
            const data = await fetchLeaderboardData();
            if (!data?.leaderboard) return;

            for (const user of data.leaderboard) {
                if (!user.achievements) continue;

                const userKey = user.username.toLowerCase();
                const previouslyEarned = this.lastAchievements.get(userKey) || new Set();
                const currentEarned = new Set();

                for (const ach of user.achievements) {
                    const earnedDate = parseInt(ach.DateEarned, 10);

                    if (earnedDate > 0) {
                        currentEarned.add(ach.ID);

                        if (!previouslyEarned.has(ach.ID)) {
                            try {
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

                this.lastAchievements.set(userKey, currentEarned);
            }
        } catch (error) {
            console.error('AchievementFeed: Error checking achievements:', error);
        }
    }

    async announceAchievement(username, achievement) {
        if (!this.channel) {
            throw new Error('AchievementFeed: Channel not available');
        }
        if (!username || !achievement) {
            throw new Error('AchievementFeed: Missing user or achievement data');
        }

        const now = Date.now();
        this.announcementTimestamps = this.announcementTimestamps.filter(
            (timestamp) => now - timestamp < this.TIME_WINDOW_MS
        );

        if (this.announcementTimestamps.length >= this.MAX_ANNOUNCEMENTS) {
            console.warn(`AchievementFeed: Rate limit hit - skipping announcement for ${username}`);
            return;
        }

        this.announcementTimestamps.push(now);

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
                `*${achievement.Description || 'No description available'}*`
            )
            .setFooter({
                text: `Points: ${achievement.Points || '0'}`,
                iconURL: userIconUrl
            })
            .setTimestamp();

        try {
            await this.channel.send({ embeds: [embed] });
        } catch (sendError) {
            if (sendError.code === 50013) {
                console.error('AchievementFeed: Bot lacks permissions to send messages in feed channel');
            } else {
                throw sendError;
            }
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

export default AchievementFeed;

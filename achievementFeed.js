const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { fetchLeaderboardData } = require('./raAPI');

class AchievementFeed {
   constructor(client, database) {
    this.client = client;
    this.database = database;

    this.channelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
    this.lastAchievements = new Map(); // key: username, value: set of earned achievement IDs
    
    // Increase check interval to reduce API load
    this.checkInterval = 10 * 60 * 1000; // 10 minutes
    this.channel = null;
    this.intervalHandle = null;

    // Enhanced rate limiting
    this.MAX_ANNOUNCEMENTS = 5;  // Max 5 announcements
    this.TIME_WINDOW_MS = 60 * 1000;  // per 60 seconds
    this.COOLDOWN_MS = 3 * 1000;  // 3 second cooldown between announcements
    
    // Track announcement history
    this.announcementHistory = {
        timestamps: [],
        messageIds: new Set(),  // Track message IDs to prevent duplicates
        lastAnnouncement: null  // Track last announcement time
    };

    // Add error tracking
    this.errorCount = 0;
    this.lastError = null;
    this.maxErrors = 5; // Max errors before temporary shutdown
    this.errorResetInterval = 30 * 60 * 1000; // 30 minutes
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
    try {
        if (!this.channel) {
            throw new Error('Channel not available');
        }

        // Validate inputs
        if (!username || !achievement) {
            throw new Error('Missing user or achievement data');
        }

        // Check for duplicate announcement
        const achievementKey = `${username}-${achievement.ID}`;
        if (this.announcementHistory.messageIds.has(achievementKey)) {
            console.log(`Skipping duplicate achievement announcement: ${achievementKey}`);
            return;
        }

        // Enforce cooldown between announcements
        const now = Date.now();
        if (this.announcementHistory.lastAnnouncement) {
            const timeSinceLastAnnouncement = now - this.announcementHistory.lastAnnouncement;
            if (timeSinceLastAnnouncement < this.COOLDOWN_MS) {
                await new Promise(resolve => 
                    setTimeout(resolve, this.COOLDOWN_MS - timeSinceLastAnnouncement)
                );
            }
        }

        // Rate limiting logic
        this.announcementHistory.timestamps = this.announcementHistory.timestamps.filter(
            timestamp => now - timestamp < this.TIME_WINDOW_MS
        );

        if (this.announcementHistory.timestamps.length >= this.MAX_ANNOUNCEMENTS) {
            console.warn(`Rate limit hit - queuing announcement for ${username}`);
            setTimeout(() => this.announceAchievement(username, achievement), 
                      this.TIME_WINDOW_MS / this.MAX_ANNOUNCEMENTS);
            return;
        }

        // Build the embed
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

        // Send the announcement
        const message = await this.channel.send({ embeds: [embed] });
        
        // Update tracking
        this.announcementHistory.timestamps.push(now);
        this.announcementHistory.messageIds.add(achievementKey);
        this.announcementHistory.lastAnnouncement = now;

        // Clean up old message IDs periodically
        if (this.announcementHistory.messageIds.size > 1000) {
            this.announcementHistory.messageIds.clear();
        }

        return message;
    } catch (error) {
        await this.handleError(error, 'Announce Achievement');
    }
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
async handleError(error, context) {
    this.errorCount++;
    this.lastError = {
        time: Date.now(),
        error: error,
        context: context
    };

    ErrorHandler.logError(error, `Achievement Feed - ${context}`);

    // If we hit max errors, temporarily stop the feed
    if (this.errorCount >= this.maxErrors) {
        console.error('Achievement Feed: Too many errors, temporarily stopping feed');
        this.stopFeed();
        
        // Restart after error reset interval
        setTimeout(() => {
            console.log('Achievement Feed: Attempting restart after error shutdown');
            this.errorCount = 0;
            this.initialize().catch(err => {
                console.error('Achievement Feed: Failed to restart:', err);
            });
        }, this.errorResetInterval);
    }

    // Try to notify channel of issues
    try {
        if (this.channel) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Achievement Feed Error')
                .setDescription('The achievement feed encountered an error. ' +
                              'Some achievements may be delayed.')
                .setTimestamp();

            await this.channel.send({ embeds: [embed] });
        }
    } catch (notifyError) {
        console.error('Achievement Feed: Failed to send error notification:', notifyError);
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

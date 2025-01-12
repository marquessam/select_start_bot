// achievementfeed.js

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { fetchLeaderboardData, fetchAllRecentAchievements } = require('./raAPI');
const { ErrorHandler, BotError } = require('./utils/errorHandler');
const { withTransaction } = require('./utils/transactions');
const commonValidators = require('./utils/validators');

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

        // Error tracking
        this.errorCount = 0;
        this.lastError = null;
        this.maxErrors = 5; // Max errors before temporary shutdown
        this.errorResetInterval = 30 * 60 * 1000; // 30 minutes
    }

    async initialize() {
        try {
            const channel = await this.client.channels.fetch(this.channelId);
            if (!channel) {
                throw new BotError('Channel not found', ErrorHandler.ERROR_TYPES.VALIDATION, 'Achievement Feed Init');
            }

            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions?.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.EmbedLinks
            ])) {
                throw new BotError('Missing required permissions', ErrorHandler.ERROR_TYPES.PERMISSION, 'Achievement Feed Init');
            }

            this.channel = channel;
            // Load initial achievements from challenge data + recent achievements
            await this.loadInitialAchievements();

            this.intervalHandle = setInterval(() => {
                this.checkNewAchievements().catch(err => {
                    this.handleError(err, 'Scheduled Check');
                });
            }, this.checkInterval);

            console.log('AchievementFeed: Initialized successfully');
            return true;
        } catch (error) {
            ErrorHandler.logError(error, 'Achievement Feed Init');
            return false;
        }
    }

    async loadInitialAchievements() {
        try {
            // 1. Fetch the challenge-based data
            const challengeData = await fetchLeaderboardData();
            // 2. Fetch recent achievements from all games
            const recentData = await fetchAllRecentAchievements();

            // Combine the two sets of achievements
            const combinedUsers = this.mergeChallengeAndRecent(challengeData, recentData);

            // Initialize lastAchievements with earned achievements
            for (const user of combinedUsers) {
                if (!user.achievements) continue;

                const earnedAchievementIds = user.achievements
                    .filter(ach => parseInt(ach.DateEarned, 10) > 0)
                    .map(ach => ach.ID);

                this.lastAchievements.set(
                    user.username.toLowerCase(),
                    new Set(earnedAchievementIds)
                );
            }
        } catch (error) {
            ErrorHandler.handleAPIError(error, 'Load Initial Achievements');
        }
    }

    async checkNewAchievements() {
        if (!this.channel) {
            throw new BotError('No valid channel to post in', ErrorHandler.ERROR_TYPES.VALIDATION, 'Achievement Feed Channel');
        }

        try {
            // 1. Fetch challenge data
            const challengeData = await fetchLeaderboardData();
            // 2. Fetch all recent achievements
            const recentData = await fetchAllRecentAchievements();

            if (!challengeData?.leaderboard) {
                throw new BotError('Invalid leaderboard data received', ErrorHandler.ERROR_TYPES.API, 'Fetch Leaderboard');
            }

            // 3. Merge user achievements
            const combinedUsers = this.mergeChallengeAndRecent(challengeData, recentData);

            // Log achievement data for debugging
            console.log('Challenge Data:', JSON.stringify(challengeData?.leaderboard?.[0]?.achievements?.slice(0, 2) || [], null, 2));
            console.log('Recent Data:', JSON.stringify(recentData?.[0]?.achievements?.slice(0, 2) || [], null, 2));

            // 4. Loop through each user to detect newly earned achievements
            for (const user of combinedUsers) {
                if (!user.achievements) continue;

                const userKey = user.username.toLowerCase();
                if (!commonValidators.username(userKey)) {
                    ErrorHandler.handleValidationError(
                        new Error('Invalid username format'),
                        { username: userKey }
                    );
                    continue;
                }

                const previouslyEarned = this.lastAchievements.get(userKey) || new Set();
                const currentEarned = new Set();

                for (const ach of user.achievements) {
                    try {
                        const earnedDate = parseInt(ach.DateEarned, 10);
                        
                        if (earnedDate > 0) {
                            currentEarned.add(ach.ID);

                            if (!previouslyEarned.has(ach.ID)) {
                                // Brief delay to avoid spamming
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                
                                await withTransaction(this.database, async (session) => {
                                    await this.announceAchievement(user.username, ach);

                                    await this.database.db.collection('achievement_announcements')
                                        .insertOne({
                                            username: user.username,
                                            achievementId: ach.ID,
                                            timestamp: new Date(),
                                            announced: true
                                        }, { session });
                                });
                            }
                        }
                    } catch (achievementError) {
                        ErrorHandler.handleDatabaseError(
                            achievementError,
                            `Process Achievement: ${user.username} - ${ach.ID}`
                        );
                    }
                }

                this.lastAchievements.set(userKey, currentEarned);
            }
        } catch (error) {
            if (error instanceof BotError) {
                ErrorHandler.logError(error, 'Achievement Feed Check');
            } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
                ErrorHandler.handleAPIError(error, 'RetroAchievements API');
            } else {
                ErrorHandler.handleDatabaseError(error, 'Achievement Feed Check');
            }

            await this.handleError(error, 'Check Achievements');
        }
    }

    mergeChallengeAndRecent(challengeData, recentData) {
        // Create a map from username to user object
        const userMap = new Map();

        // Helper function to deduplicate achievements
        const deduplicateAchievements = (achievements) => {
            const achievementMap = new Map();
            achievements.forEach(ach => {
                if (!ach) return; // Skip null/undefined achievements
                const key = `${ach.GameID}-${ach.ID}`;
                const existingAch = achievementMap.get(key);
                
                // Keep the achievement with the more recent earned date
                if (!existingAch || 
                    (parseInt(ach.DateEarned) > parseInt(existingAch.DateEarned))) {
                    achievementMap.set(key, ach);
                }
            });
            return Array.from(achievementMap.values());
        };

        // 1. Populate from challenge data
        for (const userObj of challengeData.leaderboard || []) {
            if (!userObj?.username) continue;
            const key = userObj.username.toLowerCase();
            const achievements = userObj.achievements || [];
            
            userMap.set(key, {
                username: userObj.username,
                achievements: achievements
            });
        }

        // 2. Merge in recent achievements
        for (const recentUser of recentData || []) {
            if (!recentUser?.username) continue;
            const key = recentUser.username.toLowerCase();
            const recentAchievements = recentUser.achievements || [];

            if (!userMap.has(key)) {
                // If user wasn't in challenge data, add a new entry
                userMap.set(key, {
                    username: recentUser.username,
                    achievements: recentAchievements
                });
            } else {
                // Merge achievements with existing
                const existingData = userMap.get(key);
                const combinedAchievements = [
                    ...(existingData.achievements || []),
                    ...recentAchievements
                ];

                // Deduplicate the combined achievements
                const uniqueAchievements = deduplicateAchievements(combinedAchievements);

                userMap.set(key, {
                    username: recentUser.username,
                    achievements: uniqueAchievements
                });
            }
        }

        // Final deduplication pass for all users
        const users = Array.from(userMap.values());
        return users.map(user => ({
            ...user,
            achievements: deduplicateAchievements(user.achievements)
        }));
    }

    async announceAchievement(username, achievement) {
        if (!this.channel) {
            throw new BotError('Channel not available', ErrorHandler.ERROR_TYPES.VALIDATION, 'Announce Achievement');
        }

        if (!username || !achievement) {
            throw new BotError('Missing user or achievement data', ErrorHandler.ERROR_TYPES.VALIDATION, 'Announce Achievement');
        }

        try {
            const achievementKey = `${username}-${achievement.ID}`;
            if (this.announcementHistory.messageIds.has(achievementKey)) {
                console.log(`Skipping duplicate achievement announcement: ${achievementKey}`);
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
                console.warn(`Rate limit hit - queuing announcement for ${username}`);
                setTimeout(() => this.announceAchievement(username, achievement), 
                          this.TIME_WINDOW_MS / this.MAX_ANNOUNCEMENTS);
                return;
            }

            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const userIconUrl = `https://retroachievements.org/UserPic/${username}.png`;

            // Improved game title handling
            let gameName = 'Unknown Game';
            if (achievement.GameTitle) {
                gameName = achievement.GameTitle;
            } else if (achievement.GameName) {
                gameName = achievement.GameName;
            } else if (achievement.game?.Title) {
                gameName = achievement.game.Title;
            }

            // Log the achievement data for debugging
            console.log('Achievement data:', {
                username,
                achievementTitle: achievement.Title,
                gameTitle: gameName,
                originalGameTitle: achievement.GameTitle,
                gameName: achievement.GameName,
                gameObject: achievement.game
            });

            const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('Achievement Unlocked! 🏆')
                    .setThumbnail(badgeUrl)
                    .setDescription(
                        `**${username}** earned **${achievement.Title || 'Achievement'}**\n` +
                        `*${achievement.Description || 'No description available'}*\n\n` +
                        `**Game:** ${gameName}\n` +
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

            return message;
        } catch (error) {
            await this.handleError(error, 'Announce Achievement');
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

        if (this.errorCount >= this.maxErrors) {
            console.error('Achievement Feed: Too many errors, temporarily stopping feed');
            this.stopFeed();
            
            setTimeout(() => {
                console.log('Achievement Feed: Attempting restart after error shutdown');
                this.errorCount = 0;
                this.initialize().catch(err => {
                    console.error('Achievement Feed: Failed to restart:', err);
                });
            }, this.errorResetInterval);
        }

        try {
            if (this.channel) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Achievement Feed Error')
                    .setDescription('The achievement feed encountered an error. Some achievements may be delayed.')
                    .setTimestamp();

                await this.channel.send({ embeds: [embed] });
            }
        } catch (notifyError) {
            console.error('Achievement Feed: Failed to send error notification:', notifyError);
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

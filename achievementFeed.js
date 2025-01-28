const { EmbedBuilder } = require('discord.js');
const raAPI = require('./raAPI');
const DataService = require('./services/dataService');
const { BotError, ErrorHandler } = require('./utils/errorHandler');
const database = require('./database');

class AchievementFeed {
    constructor(client) {
        this.client = client;
        this.feedChannel = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        this.announcementHistory = {
            messageIds: new Set(),
            pointAwards: new Set()
        };
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isInitializing = false;
        this.initializationComplete = false;
        this._processingAchievements = false;
    }

    startPeriodicCheck() {
        setInterval(() => this.checkNewAchievements(), this.checkInterval);
    }

    async retryOperation(operation, retries = 3, delay = 5000) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                const isLastAttempt = attempt === retries;
                const isRetryableError =
                    error.code === 'EAI_AGAIN' ||
                    error.name === 'FetchError' ||
                    error.code === 'ECONNRESET';

                if (isLastAttempt || !isRetryableError) {
                    throw error;
                }

                console.log(
                    `[ACHIEVEMENT FEED] Attempt ${attempt} failed, retrying in ${delay / 1000}s:`,
                    error.message
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    async initialize() {
        if (this.isInitializing) {
            console.log('[ACHIEVEMENT FEED] Already initializing, waiting...');
            while (this.isInitializing) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            return;
        }

        this.isInitializing = true;
        try {
            console.log('[ACHIEVEMENT FEED] Initializing achievement feed...');

            // Wait for global userStats cache if needed
            if (global.leaderboardCache?.userStats) {
                while (!global.leaderboardCache.userStats.initializationComplete) {
                    console.log('[ACHIEVEMENT FEED] Waiting for UserStats initialization...');
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }

            const [allAchievements, storedTimestamps] = await Promise.all([
                this.retryOperation(async () => {
                    return await raAPI.fetchAllRecentAchievements();
                }),
                database.getLastAchievementTimestamps()
            ]);

            // Update DB timestamps if no timestamp is stored for a given user
            for (const { username, achievements } of allAchievements) {
                if (achievements && achievements.length > 0) {
                    const lastStoredTime = storedTimestamps[username.toLowerCase()];
                    if (!lastStoredTime) {
                        const mostRecentTime = new Date(achievements[0].Date).getTime();
                        await database.updateLastAchievementTimestamp(
                            username.toLowerCase(),
                            mostRecentTime
                        );
                    }
                }
            }

            this.initializationComplete = true;
            this.startPeriodicCheck();
            console.log('[ACHIEVEMENT FEED] Achievement feed initialized successfully');
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error initializing achievement feed:', error);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    async queueAnnouncement(announcementData) {
        /*
          announcementData should be an object of:
          {
            messageOptions,      // { embeds: [...], files: [...] }
            isMonthlyChallenge,  // bool
            isShadowGame         // bool
          }
        */
        this.announcementQueue.push(announcementData);
        if (!this.isProcessingQueue) {
            await this.processAnnouncementQueue();
        }
    }

    async processAnnouncementQueue() {
        if (this.isProcessingQueue || this.announcementQueue.length === 0) return;

        this.isProcessingQueue = true;
        try {
            const channel = await this.client.channels.fetch(this.feedChannel);

            while (this.announcementQueue.length > 0) {
                const {
                    messageOptions,
                    isMonthlyChallenge,
                    isShadowGame
                } = this.announcementQueue.shift();

                const sentMessage = await channel.send(messageOptions);

                // If you ever want to react to the message, do it here:
                // if (isMonthlyChallenge) {
                //     await sentMessage.react('monthly_challenge_logo');
                // } else if (isShadowGame) {
                //     await sentMessage.react('shadow_game_logo');
                // }

                // Throttle announcements slightly
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error processing announcement queue:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    async checkNewAchievements() {
        if (this._processingAchievements) {
            console.log('[ACHIEVEMENT FEED] Already processing achievements, skipping...');
            return;
        }

        this._processingAchievements = true;
        try {
            const [allAchievements, storedTimestamps] = await Promise.all([
                this.retryOperation(async () => {
                    return await raAPI.fetchAllRecentAchievements();
                }),
                database.getLastAchievementTimestamps()
            ]);

            const channel = await this.client.channels.fetch(this.feedChannel);
            if (!channel) {
                throw new Error('Achievement feed channel not found');
            }

            for (const { username, achievements } of allAchievements) {
                if (!achievements || achievements.length === 0) continue;

                const lastCheckedTime = storedTimestamps[username.toLowerCase()] || 0;

                // Sort by ascending date
                const sortedAchievements = [...achievements].sort(
                    (a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime()
                );

                // Filter out achievements older than the last stored timestamp
                const newAchievements = sortedAchievements.filter(
                    (ach) => new Date(ach.Date).getTime() > lastCheckedTime
                );

                if (newAchievements.length > 0) {
                    // Update last timestamp to the most recent achievement date
                    const latestTime = new Date(
                        sortedAchievements[sortedAchievements.length - 1].Date
                    ).getTime();

                    await database.updateLastAchievementTimestamp(
                        username.toLowerCase(),
                        latestTime
                    );

                    // Announce each new achievement
                    for (const achievement of newAchievements) {
                        await this.sendAchievementNotification(channel, username, achievement);
                        await new Promise((resolve) => setTimeout(resolve, 500));
                    }
                }
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error checking new achievements:', error);
        } finally {
            this._processingAchievements = false;
        }
    }

    async sendAchievementNotification(channel, username, achievement) {
        try {
            if (!channel || !username || !achievement) {
                throw new BotError(
                    'Missing required data',
                    ErrorHandler.ERROR_TYPES.VALIDATION,
                    'Announce Achievement'
                );
            }

            // Build a unique key to prevent duplicate announcements
            const achievementKey = `${username}-${
                achievement.ID ||
                achievement.AchievementID ||
                achievement.achievementID ||
                achievement.id ||
                Date.now()
            }-${achievement.GameTitle}-${achievement.Title}`;

            if (this.announcementHistory.messageIds.has(achievementKey)) {
                console.log(
                    `[ACHIEVEMENT FEED] Skipping duplicate achievement: ${username} - ${achievement.Title} in ${achievement.GameTitle}`
                );
                return;
            }

            const currentChallenge = await database.getCurrentChallenge();
            const shadowGame = await database.getShadowGame();

            const achievementGameId = String(achievement.GameID || achievement.gameId);
            const monthlyGameId = currentChallenge?.gameId
                ? String(currentChallenge.gameId)
                : null;
            const shadowGameId = shadowGame?.finalReward?.gameId
                ? String(shadowGame.finalReward.gameId)
                : null;

            const isMonthlyChallenge =
                monthlyGameId && achievementGameId === monthlyGameId;
            const isShadowGame =
                shadowGame?.active && shadowGameId && achievementGameId === shadowGameId;

            // Get the badge image (achievement icon) and user icon
            const [badgeUrl, userIconUrl] = await Promise.all([
                achievement.BadgeName
                    ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                    : 'https://media.retroachievements.org/Badge/00000.png',
                DataService.getRAProfileImage(username)
            ]);

            // We'll use the embed's .setAuthor() if it's monthly or shadow
            let authorName = '';
            let authorIconUrl = '';
            const files = [];

            if (isMonthlyChallenge) {
                authorName = 'MONTHLY CHALLENGE';
                // We attach monthly_logo.png from the root,
                // name it 'monthly_challenge_logo.png' so we can reference it
                // with "attachment://monthly_challenge_logo.png"
                files.push({
                    attachment: './monthly_logo.png',
                    name: 'monthly_challenge_logo.png'
                });
                authorIconUrl = 'attachment://monthly_challenge_logo.png';
            } else if (isShadowGame) {
                authorName = 'SHADOW GAME';
                files.push({
                    attachment: './shadow_logo.png',
                    name: 'shadow_game_logo.png'
                });
                authorIconUrl = 'attachment://shadow_game_logo.png';
            }

            // Build the embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`${achievement.GameTitle || 'Game'} 🏆`)
                // If it's monthly/shadow, show a small logo left of the title
                .setAuthor({
                    name: authorName,
                    iconURL: authorIconUrl || null
                })
                // The badge is the thumbnail (right side)
                .setThumbnail(badgeUrl)
                .setDescription(
                    `**${username}** earned **${achievement.Title || 'Achievement'}**\n\n` +
                    `*${achievement.Description || 'No description available'}*`
                )
                .setFooter({
                    text: `Points: ${achievement.Points || '0'} • ${new Date(
                        achievement.Date
                    ).toLocaleTimeString()}`,
                    iconURL: userIconUrl ||
                        `https://retroachievements.org/UserPic/${username}.png`
                })
                .setTimestamp();

            const messageOptions = {
                embeds: [embed],
                files
            };

            await this.queueAnnouncement({
                messageOptions,
                isMonthlyChallenge,
                isShadowGame
            });

            // Track we've announced this achievement to avoid duplicates
            this.announcementHistory.messageIds.add(achievementKey);
            if (this.announcementHistory.messageIds.size > 1000) {
                this.announcementHistory.messageIds.clear();
            }

            console.log(
                `[ACHIEVEMENT FEED] Sent ${
                    isMonthlyChallenge
                        ? 'monthly challenge'
                        : isShadowGame
                        ? 'shadow game'
                        : 'regular'
                } achievement notification for ${username}: ${achievement.Title}`
            );
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error sending achievement notification:', error);
            throw error;
        }
    }

    async announcePointsAward(username, points, reason) {
        try {
            if (!this.feedChannel) {
                console.warn(
                    '[ACHIEVEMENT FEED] No feedChannel configured for points announcements'
                );
                return;
            }

            const awardKey = `${username}-${points}-${reason}-${Date.now()}`;
            if (this.announcementHistory.pointAwards.has(awardKey)) {
                console.log(
                    `[ACHIEVEMENT FEED] Skipping duplicate points announcement: ${awardKey}`
                );
                return;
            }

            this.announcementHistory.pointAwards.add(awardKey);

            const userProfile = await DataService.getRAProfileImage(username);

            // Basic embed for awarding points
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setAuthor({
                    name: username,
                    iconURL:
                        userProfile || `https://retroachievements.org/UserPic/${username}.png`,
                    url: `https://retroachievements.org/user/${username}`
                })
                .setTitle('🏆 Points Awarded!')
                .setDescription(
                    `**${username}** earned **${points} point${
                        points !== 1 ? 's' : ''
                    }**!\n*${reason}*`
                )
                .setTimestamp();

            // This is not monthly or shadow specifically, so no extra images:
            await this.queueAnnouncement({
                messageOptions: { embeds: [embed] },
                isMonthlyChallenge: false,
                isShadowGame: false
            });

            if (this.announcementHistory.pointAwards.size > 1000) {
                this.announcementHistory.pointAwards.clear();
            }

            console.log(
                `[ACHIEVEMENT FEED] Queued points announcement for ${username}: ${points} points (${reason})`
            );
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error announcing points award:', error);
            this.announcementHistory.pointAwards.delete(awardKey);
        }
    }

    async manualCheck() {
        console.log('[ACHIEVEMENT FEED] Manual achievement check initiated');
        await this.checkNewAchievements();
    }
}

module.exports = AchievementFeed;

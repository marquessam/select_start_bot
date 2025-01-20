// achievementFeed.js
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
            pointAwards: new Set()  // Track point award announcements
        };
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isInitializing = false;
        this.initializationComplete = false;
        this._processingAchievements = false;
    }

    async initialize() {
        if (this.isInitializing) {
            console.log('[ACHIEVEMENT FEED] Already initializing, waiting...');
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.isInitializing = true;
        try {
            console.log('[ACHIEVEMENT FEED] Initializing achievement feed...');
            
            // Wait for UserStats to be ready
            if (global.leaderboardCache?.userStats) {
                while (!global.leaderboardCache.userStats.initializationComplete) {
                    console.log('[ACHIEVEMENT FEED] Waiting for UserStats initialization...');
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            // Get initial achievements and stored timestamps
            const [allAchievements, storedTimestamps] = await Promise.all([
                this.retryOperation(async () => {
                    return await raAPI.fetchAllRecentAchievements();
                }),
                database.getLastAchievementTimestamps()
            ]);
            
            // For any users without stored timestamps, use their most recent achievement
            for (const { username, achievements } of allAchievements) {
                if (achievements && achievements.length > 0) {
                    const lastStoredTime = storedTimestamps[username.toLowerCase()];
                    if (!lastStoredTime) {
                        // Store the most recent achievement time as starting point
                        const mostRecentTime = new Date(achievements[0].Date).getTime();
                        await database.updateLastAchievementTimestamp(
                            username.toLowerCase(), 
                            mostRecentTime
                        );
                    }
                }
            }

            this.initializationComplete = true;
            // Start periodic checking
            this.startPeriodicCheck();
            console.log('[ACHIEVEMENT FEED] Achievement feed initialized successfully');
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error initializing achievement feed:', error);
            throw error;
        } finally {
            this.isInitializing = false;
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

            // Process achievements sequentially to maintain order
            for (const { username, achievements } of allAchievements) {
                if (!achievements || achievements.length === 0) continue;

                const lastCheckedTime = storedTimestamps[username.toLowerCase()] || 0;
                
                // Sort achievements by date (oldest first)
                const sortedAchievements = [...achievements].sort(
                    (a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime()
                );
                
                // Filter new achievements
                const newAchievements = sortedAchievements.filter(ach => 
                    new Date(ach.Date).getTime() > lastCheckedTime
                );

                // Update timestamp first to prevent duplicates
                if (newAchievements.length > 0) {
                    const latestTime = new Date(
                        sortedAchievements[sortedAchievements.length - 1].Date
                    ).getTime();
                    
                    await database.updateLastAchievementTimestamp(
                        username.toLowerCase(), 
                        latestTime
                    );

                    // Process achievements in order
                    for (const achievement of newAchievements) {
                        await this.sendAchievementNotification(channel, username, achievement);
                        // Add small delay between notifications
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error checking new achievements:', error);
        } finally {
            this._processingAchievements = false;
        }
    }

    async announcePointsAward(username, points, reason) {
        try {
            if (!this.feedChannel) {
                console.warn('[ACHIEVEMENT FEED] No feedChannel configured for points announcements');
                return;
            }

            // Create unique key for this points award
            const awardKey = `${username}-${points}-${reason}-${Date.now()}`;
            if (this.announcementHistory.pointAwards.has(awardKey)) {
                console.log(`[ACHIEVEMENT FEED] Skipping duplicate points announcement: ${awardKey}`);
                return;
            }

            // Track this announcement before proceeding
            this.announcementHistory.pointAwards.add(awardKey);

            // Get user profile image
            const userProfile = await DataService.getRAProfileImage(username);
            
            // Create points award embed
            const embed = new EmbedBuilder()
                .setColor('#FFD700')  // Gold color for points
                .setAuthor({
                    name: username,
                    iconURL: userProfile || `https://retroachievements.org/UserPic/${username}.png`,
                    url: `https://retroachievements.org/user/${username}`
                })
                .setTitle('🏆 Points Awarded!')
                .setDescription(`**${username}** earned **${points} point${points !== 1 ? 's' : ''}**!\n*${reason}*`)
                .setTimestamp();

            // Queue the announcement
            await this.queueAnnouncement(embed);

            // Clean up old point award history if needed
            if (this.announcementHistory.pointAwards.size > 1000) {
                this.announcementHistory.pointAwards.clear();
            }

            console.log(`[ACHIEVEMENT FEED] Queued points announcement for ${username}: ${points} points (${reason})`);
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error announcing points award:', error);
            // Remove from history if announcement failed
            this.announcementHistory.pointAwards.delete(awardKey);
        }
    }

    // Optional: manual trigger for checking achievements
    async manualCheck() {
        console.log('[ACHIEVEMENT FEED] Manual achievement check initiated');
        await this.checkNewAchievements();
    }
}

module.exports = AchievementFeed;

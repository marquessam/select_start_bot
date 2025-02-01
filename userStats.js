const database = require('./database');
const pointsManager = require('./pointsConfig');

class UserStats {
    constructor(database) {
        this.database = database;
        this.cache = {
            stats: {
                users: {},
                yearlyStats: {},
                monthlyStats: {},
                gamesBeaten: {},
                achievementStats: {},
                communityRecords: {}
            },
            lastUpdate: null,
            updateInterval: 5 * 60 * 1000, // 5 minutes
            validUsers: new Set(),
            pendingUpdates: new Set()
        };

        this.currentYear = new Date().getFullYear();
        this.isInitializing = false;
        this.initializationComplete = false;

        // ✅ Ensure functions are properly bound
        this.processUserPoints = this.processUserPoints.bind(this);
        this.recheckAllPoints = this.recheckAllPoints.bind(this);
        this.loadStats = this.loadStats.bind(this);
    }

    async initialize() {
        if (this.isInitializing) {
            console.log('[USER STATS] Already initializing...');
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.isInitializing = true;
        try {
            console.log('[USER STATS] Initializing...');

            const users = await this.database.getAllUsers();
            this.cache.validUsers = new Set(users);

            this.initializationComplete = true;
            console.log('[USER STATS] Initialization complete.');
        } catch (error) {
            console.error('[USER STATS] Initialization error:', error);
        } finally {
            this.isInitializing = false;
        }
    }

   async loadStats() {
    try {
        console.log('[USER STATS] Loading user stats...');

        if (!this.database || typeof this.database.getUserStats !== 'function') {
            throw new Error('[USER STATS] getUserStats() is not defined in database.js');
        }

        const validUsers = await this.getAllUsers(); // Ensure all users are fetched
        if (!Array.isArray(validUsers) || validUsers.length === 0) {
            console.warn('[USER STATS] No valid users found.');
            this.cache.stats.users = {};
            return;
        }

        this.cache.stats.users = {}; // Reset cache

        for (const username of validUsers) {
            const userStats = await this.database.getUserStats(username);
            if (!userStats) {
                console.warn(`[USER STATS] No stats found for ${username}`);
                continue;
            }

            this.cache.stats.users[username] = {
                points: userStats.points || 0,
                achievements: userStats.achievements || []
            };
        }

        this.cache.lastUpdate = Date.now();
        console.log('[USER STATS] Successfully loaded user stats.');
    } catch (error) {
        console.error('[USER STATS] Error loading stats:', error);
        throw error;
    }
}


    async processUserPoints(username, member = null) {
        try {
            console.log(`[USER STATS] Processing points for ${username}...`);

            const userData = await this.database.getUserStats(username);
            if (!userData) {
                console.warn(`[USER STATS] No data found for user: ${username}`);
                return;
            }

            let newPoints = userData.points || 0;
            const earnedAchievements = await this.database.getUserAchievements(username);

            if (earnedAchievements.length > 0) {
                for (const achievement of earnedAchievements) {
                    newPoints += achievement.points;
                }
            }

            await this.database.updateUserPoints(username, newPoints);
            console.log(`[USER STATS] Updated points for ${username}: ${newPoints}`);
        } catch (error) {
            console.error(`[USER STATS] Error processing points for ${username}:`, error);
        }
    }

    async recheckAllPoints(guild) {
        try {
            const validUsers = await this.getAllUsers();
            const processedUsers = [];
            const errors = [];

            for (const username of validUsers) {
                try {
                    let member = null;
                    if (guild) {
                        try {
                            const guildMembers = await guild.members.fetch();
                            member = guildMembers.find(m =>
                                m.displayName.toLowerCase() === username.toLowerCase()
                            );
                        } catch (e) {
                            console.warn(`Could not find Discord member for ${username}:`, e);
                        }
                    }

                    // ✅ Ensure function exists before calling it
                    if (typeof this.processUserPoints === "function") {
                        await this.processUserPoints(username, member);
                    } else {
                        console.error(`processUserPoints is not a function in UserStats.`);
                    }

                    processedUsers.push(username);
                } catch (error) {
                    console.error(`Error processing ${username}:`, error);
                    errors.push({ username, error: error.message });
                }
            }

            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

            return { processed: processedUsers, errors };
        } catch (error) {
            console.error('[USER STATS] Error in recheckAllPoints:', error);
            throw error;
        }
    }

    async getAllUsers() {
        try {
            if (!this.cache.validUsers || this.cache.validUsers.size === 0) {
                const users = await this.database.getAllUsers();
                this.cache.validUsers = new Set(users);
            }
            return [...this.cache.validUsers];
        } catch (error) {
            console.error('[USER STATS] Error fetching all users:', error);
            return [];
        }
    }

    async updateLeaderboard() {
        try {
            console.log('[USER STATS] Updating leaderboard...');
            const leaderboardData = await this.database.getLeaderboard();
            this.cache.stats.leaderboard = leaderboardData;
            console.log('[USER STATS] Leaderboard updated.');
        } catch (error) {
            console.error('[USER STATS] Error updating leaderboard:', error);
        }
    }

    async updateUserStats(username) {
        try {
            if (!this.cache.stats.users[username]) {
                this.cache.stats.users[username] = { points: 0, achievements: [] };
            }

            const userStats = await this.database.getUserStats(username);
            if (!userStats) return;

            this.cache.stats.users[username] = {
                points: userStats.points || 0,
                achievements: userStats.achievements || []
            };

            console.log(`[USER STATS] Updated cache for ${username}`);
        } catch (error) {
            console.error(`[USER STATS] Error updating user stats for ${username}:`, error);
        }
    }

    async updateStatsCache() {
        try {
            console.log('[USER STATS] Updating stats cache...');
            const allStats = await this.database.getAllUserStats();
            this.cache.stats.users = allStats;
            this.cache.lastUpdate = Date.now();
            console.log('[USER STATS] Stats cache updated.');
        } catch (error) {
            console.error('[USER STATS] Error updating stats cache:', error);
        }
    }

    async saveUserStats(username, stats) {
        try {
            if (!username || !stats) return;
            await this.database.saveUserStats(username, stats);
            console.log(`[USER STATS] Saved stats for ${username}`);
        } catch (error) {
            console.error(`[USER STATS] Error saving stats for ${username}:`, error);
        }
    }
}

module.exports = UserStats;

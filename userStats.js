const database = require('./database');
const pointsManager = require('./pointsConfig');

class UserStats {
    constructor(database) {
        if (!database) {
            throw new Error('[USER STATS] Database instance is required!');
        }

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

            if (!this.database || typeof this.database.getValidUsers !== 'function') {
                throw new Error('[USER STATS] getValidUsers() is not defined in database.js');
            }

            const users = await this.database.getValidUsers();
            if (!Array.isArray(users) || users.length === 0) {
                console.warn('[USER STATS] No valid users found.');
                this.cache.validUsers = new Set();
            } else {
                this.cache.validUsers = new Set(users);
            }

            this.initializationComplete = true;
            console.log('[USER STATS] Initialization complete.');
        } catch (error) {
            console.error('[USER STATS] Initialization error:', error);
        } finally {
            this.isInitializing = false;
        }
    }

    async initializeUserIfNeeded(username) {
        try {
            console.log(`[USER STATS] Checking if user ${username} needs initialization...`);

            const userStats = await this.database.getUserStats(username);
            if (!userStats) {
                console.log(`[USER STATS] No stats found for ${username}, initializing...`);
                await this.database.createUserStats(username);
                return { username, initialized: true };
            }

            return { username, initialized: false };
        } catch (error) {
            console.error(`[USER STATS] Error initializing user ${username}:`, error);
            return { username, initialized: false, error };
        }
    }

    async loadStats() {
        try {
            console.log('[USER STATS] Loading user stats...');

            if (!this.database || typeof this.database.getValidUsers !== 'function') {
                throw new Error('[USER STATS] getValidUsers() is not defined in database.js');
            }

            const validUsers = await this.database.getValidUsers();
            if (!Array.isArray(validUsers) || validUsers.length === 0) {
                console.warn('[USER STATS] No valid users found.');
                this.cache.stats.users = {};
                return;
            }

            this.cache.stats.users = {};

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

    async getValidUsers() {
        try {
            if (!this.cache.validUsers || this.cache.validUsers.size === 0) {
                const users = await this.database.getValidUsers();
                this.cache.validUsers = new Set(users);
            }
            return [...this.cache.validUsers];
        } catch (error) {
            console.error('[USER STATS] Error fetching valid users:', error);
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

    async updateStatsCache() {
        try {
            console.log('[USER STATS] Updating stats cache...');
            if (!this.database || typeof this.database.getValidUsers !== 'function') {
                throw new Error('[USER STATS] getValidUsers() is not defined in database.js');
            }

            const users = await this.database.getValidUsers();
            const stats = {};
            for (const username of users) {
                const userStats = await this.database.getUserStats(username);
                if (userStats) {
                    stats[username] = {
                        points: userStats.points || 0,
                        achievements: userStats.achievements || []
                    };
                }
            }

            this.cache.stats.users = stats;
            this.cache.lastUpdate = Date.now();
            console.log('[USER STATS] Stats cache updated.');
        } catch (error) {
            console.error('[USER STATS] Error updating stats cache:', error);
        }
    }
}

module.exports = UserStats;

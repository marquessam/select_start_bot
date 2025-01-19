const { fetchLeaderboardData } = require('./raAPI.js');
const { ErrorHandler, BotError } = require('./utils/errorHandler');
const CacheManager = require('./utils/cacheManager');

class LeaderboardCache {
    constructor(database) {
        this.database = database;
        this.userStats = null;
        
        // Initialize cache managers
        this.userCache = new CacheManager({
            defaultTTL: 15 * 60 * 1000,  // 15 minutes
            maxSize: 500
        });
        
        this.leaderboardCache = new CacheManager({
            defaultTTL: 10 * 60 * 1000,  // 10 minutes
            maxSize: 100
        });

        this.cache = {
            validUsers: new Set(),
            yearlyLeaderboard: [],
            monthlyLeaderboard: [],
            lastUpdated: null,
            updateInterval: 15 * 60 * 1000  // 15 minutes
        };
    }

    setUserStats(userStatsInstance) {
        this.userStats = userStatsInstance;
    }

    async initialize() {
        try {
            console.log('[LEADERBOARD CACHE] Initializing...');
            await this.updateValidUsers();
            await this.updateLeaderboards(true); // Force initial update
            console.log('[LEADERBOARD CACHE] Initialization complete');
            return true;
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Initialization error:', error);
            return false;
        }
    }

    async updateValidUsers() {
        try {
            if (!this.database) {
                throw new Error('Database instance not set');
            }

            const users = await this.database.getValidUsers();
            this.cache.validUsers = new Set(users.map(u => u.toLowerCase()));

            console.log(`[LEADERBOARD CACHE] Updated valid users: ${users.length} users`);

            // Initialize stats for all valid users if userStats is available
            if (this.userStats) {
                for (const username of users) {
                    await this.userStats.initializeUserIfNeeded(username);
                }
            }

            return true;
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating valid users:', error);
            return false;
        }
    }

    isValidUser(username) {
        return username && this.cache.validUsers.has(username.toLowerCase());
    }

    async updateLeaderboards(force = false) {
        // Check if we actually need to update
        if (!force && !this._shouldUpdate()) {
            return;
        }

        console.log('[LEADERBOARD CACHE] Updating leaderboards...');

        // Ensure we have valid users
        if (this.cache.validUsers.size === 0) {
            await this.updateValidUsers();
        }

        try {
            // Fetch fresh leaderboard data from raAPI
            const monthlyData = await fetchLeaderboardData();
            // Construct the monthly leaderboard array
            this.cache.monthlyLeaderboard = this._constructMonthlyLeaderboard(monthlyData);

            // Let userStats handle participation, beaten, mastery, etc.
            if (this.userStats) {
                await this.userStats.updateMonthlyParticipation(monthlyData);
            }

            // Mark the update time
            this.cache.lastUpdated = Date.now();
            console.log('[LEADERBOARD CACHE] Leaderboards updated successfully');
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating leaderboards:', error);
            throw error;
        }
    }

    _shouldUpdate() {
        return (
            !this.cache.lastUpdated ||
            (Date.now() - this.cache.lastUpdated) > this.cache.updateInterval
        );
    }

    _constructMonthlyLeaderboard(monthlyData) {
        try {
            if (!monthlyData?.leaderboard) {
                console.warn('[LEADERBOARD CACHE] No monthly data available');
                return [];
            }

            const validUsers = Array.from(this.cache.validUsers);
            console.log(`[LEADERBOARD CACHE] Constructing monthly leaderboard for ${validUsers.length} users`);

            const monthlyParticipants = validUsers.map(participant => {
                const user = monthlyData.leaderboard.find(
                    u => u.username.toLowerCase() === participant.toLowerCase()
                );

                return user || {
                    username: participant,
                    completionPercentage: 0,
                    completedAchievements: 0,
                    totalAchievements: 0,
                    hasCompletion: false
                };
            });

            return monthlyParticipants.sort((a, b) => {
                const percentageDiff = b.completionPercentage - a.completionPercentage;
                if (percentageDiff !== 0) return percentageDiff;
                return b.completedAchievements - a.completedAchievements;
            });
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error constructing monthly leaderboard:', error);
            return [];
        }
    }

    getYearlyLeaderboard() {
        if (!this.cache.yearlyLeaderboard || !this.cache.yearlyLeaderboard.length) {
            console.warn('[LEADERBOARD CACHE] Yearly leaderboard not initialized');
            return [];
        }
        return this.cache.yearlyLeaderboard;
    }

    getMonthlyLeaderboard() {
        if (!this.cache.monthlyLeaderboard || !this.cache.monthlyLeaderboard.length) {
            console.warn('[LEADERBOARD CACHE] Monthly leaderboard not initialized');
            return [];
        }
        return this.cache.monthlyLeaderboard;
    }

    getLastUpdated() {
        return this.cache.lastUpdated;
    }

    async refreshLeaderboard() {
        await this.updateLeaderboards(true);
    }
}

// Factory function if you want to create an instance
function createLeaderboardCache(database) {
    return new LeaderboardCache(database);
}

module.exports = createLeaderboardCache;

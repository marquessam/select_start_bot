// leaderboardCache.js
const { fetchLeaderboardData } = require('./raAPI.js');
const { ErrorHandler, BotError } = require('./utils/errorHandler');
const CacheManager = require('./utils/cacheManager');

class LeaderboardCache {
    constructor(database) {
        this.database = database;
        this.userStats = null;
        this._updating = false;
        this._pointCheckInProgress = false;
        this.hasInitialData = false;
        this.isInitializing = false;
        this.initializationComplete = false;

        this.cache = {
            validUsers: new Set(),
            yearlyLeaderboard: [],
            monthlyLeaderboard: [],
            lastUpdated: null,
            updateInterval: 600000  // 10 minutes (match global update interval)
        };
    }

    setUserStats(userStatsInstance) {
        this.userStats = userStatsInstance;
    }

    async initialize(skipInitialFetch = false) {
        if (this.isInitializing) {
            console.log('[LEADERBOARD CACHE] Already initializing, waiting...');
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this.initializationComplete;
        }

        this.isInitializing = true;
        try {
            console.log('[LEADERBOARD CACHE] Initializing...');
            await this.updateValidUsers();
            
            // Skip the initial fetch if requested (will be done in coordinateUpdate)
            if (!skipInitialFetch) {
                await this.updateLeaderboards(true);
            }

            this.initializationComplete = true;
            console.log('[LEADERBOARD CACHE] Initialization complete');
            return true;
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Initialization error:', error);
            return false;
        } finally {
            this.isInitializing = false;
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

    _shouldUpdate() {
        return !this.cache.lastUpdated || 
               (Date.now() - this.cache.lastUpdated) > this.cache.updateInterval;
    }

    async updateLeaderboards(force = false) {
        // Prevent concurrent updates
        if (this._updating) {
            console.log('[LEADERBOARD CACHE] Update already in progress, skipping...');
            return this._getLatestData();
        }

        // Skip update if not forced and cache is still valid
        if (!force && !this._shouldUpdate()) {
            return this._getLatestData();
        }

        this._updating = true;

        try {
            console.log('[LEADERBOARD CACHE] Updating leaderboards...');

            // Ensure we have valid users
            if (this.cache.validUsers.size === 0) {
                await this.updateValidUsers();
            }

            // Get yearly leaderboard
            if (this.userStats) {
                const currentYear = new Date().getFullYear().toString();
                const validUsers = Array.from(this.cache.validUsers);
                
                this.cache.yearlyLeaderboard = await this.userStats.getYearlyLeaderboard(
                    currentYear,
                    validUsers
                );
            }

            // Get monthly leaderboard - single API call for all users
            const monthlyData = await fetchLeaderboardData(force);
            this.cache.monthlyLeaderboard = this._constructMonthlyLeaderboard(monthlyData);
            
            // Create return data structure
            const returnData = {
                leaderboard: this.cache.monthlyLeaderboard,
                gameInfo: monthlyData.gameInfo,
                lastUpdated: new Date().toISOString()
            };

            this.cache.lastUpdated = Date.now();
            this.hasInitialData = true;
            console.log('[LEADERBOARD CACHE] Leaderboards updated successfully');

            return returnData;
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating leaderboards:', error);
            return this._getLatestData();
        } finally {
            this._updating = false;
        }
    }

    _getLatestData() {
        return {
            leaderboard: this.cache.monthlyLeaderboard,
            lastUpdated: this.cache.lastUpdated || new Date().toISOString()
        };
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
                    hasCompletion: false,
                    achievements: []
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
        return await this.updateLeaderboards(true);
    }
}

function createLeaderboardCache(database) {
    return new LeaderboardCache(database);
}

module.exports = createLeaderboardCache;

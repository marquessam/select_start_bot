const { fetchLeaderboardData } = require('./raAPI.js');
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

    this.validUsers = new Set();
    this.updateInterval = 15 * 60 * 1000;  // 15 minutes
    this.lastUpdate = null;
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
            if (!this.userStats) {
                throw new Error('UserStats instance not set');
            }

            const users = await this.database.getValidUsers();
            this.cache.validUsers = new Set(users.map(u => u.toLowerCase()));

            console.log(`[LEADERBOARD CACHE] Updated valid users: ${users.length} users`);

            // Initialize stats for all valid users
            for (const username of users) {
                await this.userStats.initializeUserIfNeeded(username);
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
        try {
            if (!this.userStats) {
                throw new Error('UserStats instance not set');
            }

            if (!force && !this._shouldUpdate()) {
                return;
            }

            console.log('[LEADERBOARD CACHE] Updating leaderboards...');

            // Ensure we have valid users
            if (this.cache.validUsers.size === 0) {
                await this.updateValidUsers();
            }

            // Get yearly leaderboard
            const currentYear = new Date().getFullYear().toString();
            const validUsers = Array.from(this.cache.validUsers);
            
            this.cache.yearlyLeaderboard = await this.userStats.getYearlyLeaderboard(
                currentYear,
                validUsers
            );

            // Get monthly leaderboard
            try {
                const monthlyData = await fetchLeaderboardData();
                this.cache.monthlyLeaderboard = this._constructMonthlyLeaderboard(monthlyData);
                
                // Update participation tracking
                await this.userStats.updateMonthlyParticipation(monthlyData);
            } catch (error) {
                console.error('[LEADERBOARD CACHE] Error fetching monthly data:', error);
                // Keep existing monthly data if fetch fails
                if (!this.cache.monthlyLeaderboard.length) {
                    this.cache.monthlyLeaderboard = [];
                }
            }

            this.cache.lastUpdated = Date.now();
            console.log('[LEADERBOARD CACHE] Leaderboards updated successfully');
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating leaderboards:', error);
            throw error;
        }
    }

    _shouldUpdate() {
        return !this.cache.lastUpdated || 
               (Date.now() - this.cache.lastUpdated) > this.cache.updateInterval;
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

   async getYearlyLeaderboard(year = null, allParticipants = []) {
    const cacheKey = `yearly-${year || 'current'}-${allParticipants.length}`;
    
    return await this.leaderboardCache.getOrFetch(cacheKey, async () => {
        try {
            const targetYear = year || new Date().getFullYear().toString();
            if (!this.userStats) return [];

            const leaderboard = await Promise.all(
                allParticipants
                    .filter(username => this.validUsers.has(username.toLowerCase()))
                    .map(async username => {
                        const stats = await this.userCache.getOrFetch(
                            `stats-${username}`,
                            async () => this.userStats.getUserStats(username)
                        );
                        
                        return {
                            username,
                            points: stats?.yearlyPoints?.[targetYear] || 0,
                            gamesBeaten: stats?.yearlyStats?.[targetYear]?.gamesBeaten || 0,
                            achievementsUnlocked: stats?.yearlyStats?.[targetYear]?.totalAchievementsUnlocked || 0,
                            monthlyParticipations: stats?.yearlyStats?.[targetYear]?.monthlyParticipations || 0
                        };
                    })
            );

            return leaderboard.sort((a, b) => 
                b.points - a.points || b.gamesBeaten - a.gamesBeaten
            );
        } catch (error) {
            ErrorHandler.logError(error, 'Yearly Leaderboard Generation');
            return [];
        }
    });
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

function createLeaderboardCache(database) {
    return new LeaderboardCache(database);
}

module.exports = createLeaderboardCache;

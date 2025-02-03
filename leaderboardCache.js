// leaderboardCache.js
const { fetchLeaderboardData } = require('./raAPI.js');
const { ErrorHandler } = require('./utils/errorHandler');

class LeaderboardCache {
    constructor(database) {
        this.database = database;
        this.services = null;
        
        // Flags for concurrency & state
        this._initPromise = null;
        this._updatePromise = null;
        this._updating = false;
        this.isInitializing = false;
        this.hasInitialData = false;
        this.initializationComplete = false;

        // Cache structure
        this.cache = {
            validUsers: new Set(),
            yearlyLeaderboard: [],
            monthlyLeaderboard: [],
            lastUpdated: null,
            updateInterval: 600000 // 10 minutes
        };
    }

    setServices(services) {
        this.services = services;
        console.log('[LEADERBOARD CACHE] Services updated');
    }

    async initialize(skipInitialFetch = false) {
        if (this.isInitializing) {
            console.log('[LEADERBOARD CACHE] Already initializing, returning existing init promise...');
            return this._initPromise;
        }

        this.isInitializing = true;

        this._initPromise = (async () => {
            try {
                console.log('[LEADERBOARD CACHE] Initializing...');
                await this.updateValidUsers();

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
        })();

        return this._initPromise;
    }

    async updateValidUsers() {
        try {
            const users = await this.database.getValidUsers();
            this.cache.validUsers = new Set(users.map(u => u.toLowerCase()));
            console.log(`[LEADERBOARD CACHE] Updated valid users: ${users.length} users`);
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
        if (this._updating) {
            console.log('[LEADERBOARD CACHE] Update already in progress, returning existing update promise...');
            return this._updatePromise;
        }

        if (!force && !this._shouldUpdate()) {
            return this._getLatestData();
        }

        this._updating = true;

        this._updatePromise = (async () => {
            try {
                console.log('[LEADERBOARD CACHE] Updating leaderboards...');
                
                if (this.cache.validUsers.size === 0) {
                    await this.updateValidUsers();
                }

                const currentDate = new Date();
                const currentMonth = currentDate.getMonth() + 1;
                const currentYear = currentDate.getFullYear();
                const validUsers = Array.from(this.cache.validUsers);

                // Get RetroAchievements data for achievement progress
                const raData = await fetchLeaderboardData(force);

                // Update monthly leaderboard
                const monthlyPromises = validUsers.map(async username => {
                    // Get achievement-based points
                    const achievementPoints = await this.services.achievementSystem.calculatePoints(
                        username,
                        currentMonth,
                        currentYear
                    );

                    // Get RA progress data
                    const raProgress = raData.leaderboard.find(u => 
                        u.username.toLowerCase() === username.toLowerCase()
                    ) || {
                        completionPercentage: 0,
                        completedAchievements: 0,
                        totalAchievements: 0
                    };

                    // Group achievements by type
                    const achievementTypes = {};
                    for (const [gameId, gameData] of Object.entries(achievementPoints.games)) {
                        for (const achievement of gameData.achievements) {
                            if (!achievementTypes[achievement.type]) {
                                achievementTypes[achievement.type] = 0;
                            }
                            achievementTypes[achievement.type]++;
                        }
                    }

                    return {
                        username,
                        points: achievementPoints.total,
                        games: achievementPoints.games,
                        achievements: achievementTypes,
                        completionPercentage: raProgress.completionPercentage,
                        completedAchievements: raProgress.completedAchievements,
                        totalAchievements: raProgress.totalAchievements
                    };
                });

                this.cache.monthlyLeaderboard = await Promise.all(monthlyPromises);

                // Update yearly leaderboard
                const yearlyPromises = validUsers.map(async username => {
                    const yearlyPoints = await this.services.achievementSystem.calculatePoints(
                        username,
                        null,
                        currentYear
                    );

                    return {
                        username,
                        points: yearlyPoints.total,
                        games: yearlyPoints.games
                    };
                });

                this.cache.yearlyLeaderboard = await Promise.all(yearlyPromises);

                // Sort leaderboards
                this.cache.monthlyLeaderboard.sort((a, b) => b.points - a.points);
                this.cache.yearlyLeaderboard.sort((a, b) => b.points - a.points);

                this.cache.lastUpdated = Date.now();
                this.hasInitialData = true;

                return {
                    leaderboard: this.cache.monthlyLeaderboard,
                    lastUpdated: new Date().toISOString()
                };
            } catch (error) {
                console.error('[LEADERBOARD CACHE] Error updating leaderboards:', error);
                return this._getLatestData();
            } finally {
                this._updating = false;
            }
        })();

        return this._updatePromise;
    }

    _getLatestData() {
        const lastUpdatedStr = this.cache.lastUpdated
            ? new Date(this.cache.lastUpdated).toISOString()
            : 'never';
        console.log(`[LEADERBOARD CACHE] Returning cached data from: ${lastUpdatedStr}`);

        return {
            leaderboard: this.cache.monthlyLeaderboard,
            lastUpdated: this.cache.lastUpdated || new Date().toISOString()
        };
    }

    getMonthlyLeaderboard() {
        if (!this.cache.monthlyLeaderboard.length) {
            console.warn('[LEADERBOARD CACHE] Monthly leaderboard not initialized');
            return [];
        }

        return [...this.cache.monthlyLeaderboard];
    }

    getYearlyLeaderboard() {
        if (!this.cache.yearlyLeaderboard.length) {
            console.warn('[LEADERBOARD CACHE] Yearly leaderboard not initialized');
            return [];
        }

        return [...this.cache.yearlyLeaderboard];
    }

    async refreshLeaderboards() {
        console.log('[LEADERBOARD CACHE] Forcing leaderboard refresh...');
        return await this.updateLeaderboards(true);
    }
}

function createLeaderboardCache(database) {
    return new LeaderboardCache(database);
}

module.exports = createLeaderboardCache;

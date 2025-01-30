// leaderboardCache.js
const { fetchLeaderboardData } = require('./raAPI.js');
const { ErrorHandler, BotError } = require('./utils/errorHandler');

class LeaderboardCache {
    constructor(database) {
        this.database = database;
        this.userStats = null;
        
        // Flags for concurrency & state
        this._initPromise = null;      // For initialization concurrency
        this._updatePromise = null;    // For leaderboard updates
        this._updating = false;        // True if an update is in progress
        this.isInitializing = false;   // True if initialize() is in progress
        
        this._pointCheckInProgress = false; // (unused in this snippet but left as-is)
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

    setUserStats(userStatsInstance) {
        this.userStats = userStatsInstance;
    }

    /**
     * Initialize the leaderboard cache.
     * If another initialization is in progress, returns the existing promise
     * instead of blocking in a while loop.
     */
    async initialize(skipInitialFetch = false) {
        if (this.isInitializing) {
            console.log('[LEADERBOARD CACHE] Already initializing, returning existing init promise...');
            return this._initPromise;
        }

        this.isInitializing = true;

        // Create a shared promise for initialization so repeated calls can await the same promise
        this._initPromise = (async () => {
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
        })();

        return this._initPromise;
    }

    /**
     * Updates the list of valid users. Uses parallel user initialization (Promise.all)
     * for better performance instead of awaiting each user sequentially.
     */
    async updateValidUsers() {
        try {
            if (!this.database) {
                throw new Error('Database instance not set');
            }

            const users = await this.database.getValidUsers();
            this.cache.validUsers = new Set(users.map(u => u.toLowerCase()));

            console.log(`[LEADERBOARD CACHE] Updated valid users: ${users.length} users`);

            // If userStats is available, initialize all users in parallel
            if (this.userStats) {
                await Promise.all(
                    users.map(username => this.userStats.initializeUserIfNeeded(username))
                );
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

    /**
     * Updates the leaderboards. If another update is in progress, returns the same promise
     * instead of skipping or blocking. Avoids repeated calls while an update is running.
     */
    async updateLeaderboards(force = false) {
        // If an update is already in progress, return the existing promise
        if (this._updating) {
            console.log('[LEADERBOARD CACHE] Update already in progress, returning existing update promise...');
            return this._updatePromise;
        }

        // If we're not forcing and cache is fresh, return cached data
        if (!force && !this._shouldUpdate()) {
            return this._getLatestData();
        }

        this._updating = true;

        // Create a shared promise for the current update operation
        this._updatePromise = (async () => {
            try {
                console.log('[LEADERBOARD CACHE] Updating leaderboards...');

                // Ensure we have valid users
                if (this.cache.validUsers.size === 0) {
                    await this.updateValidUsers();
                }

                // ALWAYS update yearly leaderboard if userStats is set
                if (this.userStats) {
                    const currentYear = new Date().getFullYear().toString();
                    const validUsers = Array.from(this.cache.validUsers);

                    console.log('[LEADERBOARD CACHE] Updating yearly leaderboard...');
                    this.cache.yearlyLeaderboard = await this.userStats.getYearlyLeaderboard(
                        currentYear,
                        validUsers
                    );
                    console.log('[LEADERBOARD CACHE] Yearly leaderboard updated successfully');
                }

                // Fetch monthly leaderboard data (single API call)
                const monthlyData = await fetchLeaderboardData(force);
                this.cache.monthlyLeaderboard = this._constructMonthlyLeaderboard(monthlyData);

                // Build return object
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
                // Return whatever we have
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

                // Return either the found user or a default structure
                return user || {
                    username: participant,
                    completionPercentage: 0,
                    completedAchievements: 0,
                    totalAchievements: 0,
                    hasCompletion: false,
                    achievements: []
                };
            });

            // Sort by completionPercentage desc, then by completedAchievements desc
            const sortedParticipants = monthlyParticipants.sort((a, b) => {
                const percentageDiff = b.completionPercentage - a.completionPercentage;
                if (percentageDiff !== 0) return percentageDiff;
                return b.completedAchievements - a.completedAchievements;
            });

            console.log('[LEADERBOARD CACHE] Monthly leaderboard constructed successfully');
            return sortedParticipants;
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

        console.log(
            '[LEADERBOARD CACHE] Returning yearly leaderboard data from:',
            this.cache.lastUpdated ? new Date(this.cache.lastUpdated).toISOString() : 'never'
        );

        return this.cache.yearlyLeaderboard;
    }

    getMonthlyLeaderboard() {
        if (!this.cache.monthlyLeaderboard || !this.cache.monthlyLeaderboard.length) {
            console.warn('[LEADERBOARD CACHE] Monthly leaderboard not initialized');
            return [];
        }

        console.log(
            '[LEADERBOARD CACHE] Returning monthly leaderboard data from:',
            this.cache.lastUpdated ? new Date(this.cache.lastUpdated).toISOString() : 'never'
        );

        return this.cache.monthlyLeaderboard;
    }

    getLastUpdated() {
        return this.cache.lastUpdated;
    }

    async refreshLeaderboard() {
        console.log('[LEADERBOARD CACHE] Forcing leaderboard refresh...');
        return await this.updateLeaderboards(true);
    }
}

// Factory-style export remains the same
function createLeaderboardCache(database) {
    return new LeaderboardCache(database);
}

module.exports = createLeaderboardCache;

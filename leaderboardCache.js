// leaderboardCache.js
const ErrorHandler = require('./utils/errorHandler');

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
        return (
            !this.cache.lastUpdated ||
            (Date.now() - this.cache.lastUpdated) > this.cache.updateInterval
        );
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

                const currentDate = new Date();
                const currentMonth = currentDate.getMonth() + 1; // 1-12
                const currentYear = currentDate.getFullYear();
                const validUsers = Array.from(this.cache.validUsers);

                // 1) Get current month's monthly & shadow games
                //    e.g. { monthly: ["355"], shadow: ["274"] }
                const monthlyGames = await this.services.achievementSystem.getMonthlyGames(
                    currentMonth, 
                    currentYear
                );

                // Flatten them to get a single array of relevant game IDs
                const relevantGames = [
                    ...(monthlyGames.monthly || []),
                    ...(monthlyGames.shadow || [])
                ];

                // 2) Build monthlyLeaderboard
                //    For each user, fetch RA progress for each relevant game,
                //    then call achievementSystem.calculatePoints() for that month.
                const monthlyPromises = validUsers.map(async (username) => {
                    // We'll store simple RA progress for each relevant game
                    const userProgress = {};

                    // For each relevant game, fetch RA progress from RA
                    for (const gameId of relevantGames) {
                        const gameProgress = await this.services.raAPI.fetchCompleteGameProgress(username, gameId);
                        if (gameProgress) {
                            userProgress[gameId] = {
                                completion: gameProgress.userCompletion || '0%',
                                completedAchievements: gameProgress.numAwardedToUser || 0,
                                totalAchievements: gameProgress.numAchievements || 0,
                                highestAward: gameProgress.highestAwardKind || null
                            };
                        }
                    }

                    // Now fetch their actual points for the current month
                    const monthlyPoints = await this.services.achievementSystem.calculatePoints(
                        username,
                        currentMonth,
                        currentYear
                    );

                    return {
                        username,
                        points: monthlyPoints.total,
                        games: monthlyPoints.games,
                        progress: userProgress
                    };
                });

                this.cache.monthlyLeaderboard = await Promise.all(monthlyPromises);

                // 3) Build yearlyLeaderboard
                //    For each user, call achievementSystem.calculatePoints(null, currentYear)
                //    to get their total points in that year.
                const yearlyPromises = validUsers.map(async (username) => {
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

                // 4) Sort them descending by points
                this.cache.monthlyLeaderboard.sort((a, b) => b.points - a.points);
                this.cache.yearlyLeaderboard.sort((a, b) => b.points - a.points);

                this.cache.lastUpdated = Date.now();
                this.hasInitialData = true;

                // Return an object with monthly data for any caller
                return {
                    leaderboard: this.cache.monthlyLeaderboard,
                    games: monthlyGames,
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
        return this.cache.monthlyLeaderboard;
    }

    getYearlyLeaderboard() {
        return this.cache.yearlyLeaderboard;
    }

    getUserProgress(username) {
        const monthlyEntry = this.cache.monthlyLeaderboard.find(
            (user) => user.username.toLowerCase() === username.toLowerCase()
        );

        const yearlyEntry = this.cache.yearlyLeaderboard.find(
            (user) => user.username.toLowerCase() === username.toLowerCase()
        );

        return {
            monthly: monthlyEntry || {
                points: 0,
                games: {},
                progress: {}
            },
            yearly: yearlyEntry || {
                points: 0,
                games: {}
            }
        };
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

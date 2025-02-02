// userStats.js

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const ErrorHandler = require('./utils/errorHandler');
const { withTransaction } = require('./utils/transactions');
const { pointsConfig, pointChecks } = require('./pointsConfig');
const { fetchLeaderboardData } = require('./raAPI.js');

class UserStats {
    constructor(database, dependencies = {}) {
        this.database = database;
        this.dependencies = dependencies;
        
        this.cache = {
            stats: {
                users: {},
                yearlyStats: {},
                monthlyStats: {},
                gamesBeaten: {},
                achievementStats: {}
            },
            lastUpdate: null,
            updateInterval: 5 * 60 * 1000, // 5 minutes
            validUsers: new Set(),
            pendingUpdates: new Set()
        };

        // Tracks the current year for user stats
        this.currentYear = new Date().getFullYear();

        // Concurrency & initialization flags
        this.isInitializing = false;
        this.initializationComplete = false;

        // If an initialization is in progress, store its Promise here
        this._initializingPromise = null;

        // For controlling save concurrency
        this._savePromise = null;
        this._pendingSaves = new Set();

        // Active operations can be tracked here if needed
        this._activeOperations = new Map();
    }
     setServices(services) {
        this.services = services;
        console.log('[USER STATS] Services updated');
    }

    // =======================
    //         Core
    // =======================
    async loadStats(userTracker) {
        // If another load is in progress, just wait for that same Promise
        if (this.isInitializing) {
            console.log('[USER STATS] Already initializing, returning existing init promise...');
            return this._initializingPromise;
        }

        this.isInitializing = true;

        // Create a promise chain to handle the init work
        this._initializingPromise = (async () => {
            try {
                console.log('[USER STATS] Starting stats load...');
                const dbStats = await this.database.getUserStats();

                // Merge or default
                this.cache.stats = {
                    users: dbStats.users || {},
                    yearlyStats: dbStats.yearlyStats || {},
                    monthlyStats: dbStats.monthlyStats || {},
                    gamesBeaten: dbStats.gamesBeaten || dbStats.gameCompletions || {},
                    achievementStats: dbStats.achievementStats || {}
                };

                const users = await userTracker.getValidUsers();
                this.cache.validUsers = new Set(users.map(u => u.toLowerCase()));

                // Initialize missing user objects
                for (const username of this.cache.validUsers) {
                    await this.initializeUserIfNeeded(username);
                }

                // Save after loading everything
                await this.saveStats();
                this.cache.lastUpdate = Date.now();
                this.initializationComplete = true;

                console.log('[USER STATS] Stats load complete');
            } catch (error) {
                ErrorHandler.logError(error, 'Loading Stats');
                throw error;
            } finally {
                this.isInitializing = false;
            }
        })();

        // Return the promise so callers can await it
        return this._initializingPromise;
    }

    async saveStats() {
        // If a save is already in progress, wait for it
        if (this._savePromise) {
            console.log('[USER STATS] Another save is in progress, waiting...');
            await this._savePromise;
        }

        const saveId = Date.now().toString();
        this._pendingSaves.add(saveId);

        // Create a new Promise to handle this save operation
        this._savePromise = (async () => {
            try {
                console.log('[USER STATS] Saving stats...');
                await this.database.saveUserStats(this.cache.stats);
                this.cache.lastUpdate = Date.now();
                if (this.cache.pendingUpdates) {
                    this.cache.pendingUpdates.clear();
                }
                console.log('[USER STATS] Stats saved successfully');
            } catch (error) {
                ErrorHandler.logError(error, 'Saving Stats');
                throw error;
            } finally {
                // Clean up
                this._pendingSaves.delete(saveId);
                this._savePromise = null;
            }
        })();

        // Return the save promise so we can await if needed
        return this._savePromise;
    }

    async savePendingUpdates() {
        if (this.cache.pendingUpdates && this.cache.pendingUpdates.size > 0) {
            await this.saveStats();
        }
    }

    shouldRefreshCache() {
        return (
            !this.cache.lastUpdate ||
            Date.now() - this.cache.lastUpdate > this.cache.updateInterval
        );
    }

    async refreshCache() {
        if (!this.shouldRefreshCache()) return;

        try {
            const dbStats = await this.database.getUserStats();
            this.cache.stats = dbStats; // Overwrite or merge as needed
            this.cache.lastUpdate = Date.now();
        } catch (error) {
            ErrorHandler.logError(error, 'Refreshing Cache');
        }
    }

    // =======================
    //   User Management
    // =======================
    async initializeUserIfNeeded(username) {
        if (!username) return;
        const cleanUsername = username.trim().toLowerCase();
        if (!cleanUsername) return;

        if (!this.cache.stats.users[cleanUsername]) {
            this.cache.stats.users[cleanUsername] = {
                yearlyPoints: {},
                completedGames: {},
                monthlyAchievements: {},
                yearlyStats: {},
                participationMonths: [],
                completionMonths: [],
                masteryMonths: [],
                bonusPoints: []
            };

            const currentYear = this.currentYear.toString();
            this.cache.stats.users[cleanUsername].yearlyPoints[currentYear] = 0;
            this.cache.stats.users[cleanUsername].yearlyStats[currentYear] = {
                monthlyParticipations: 0,
                totalAchievementsUnlocked: 0,
                gamesBeaten: 0,
                hardcoreCompletions: 0,
                softcoreCompletions: 0,
                perfectMonths: 0,
                averageCompletion: 0,
                longestStreak: 0,
                currentStreak: 0,
                highestSingleDay: 0,
                mastery100Count: 0,
                participationRate: 0,
                rareAchievements: 0,
                personalBests: {
                    fastestCompletion: null,
                    highestPoints: 0,
                    bestRank: 0
                },
                achievementsPerMonth: {},
                dailyActivity: {}
            };

            if (this.cache.pendingUpdates) {
                this.cache.pendingUpdates.add(cleanUsername);
            }

            // Optionally update leaderboard after adding user
            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards();
            }
        }
    }

    async getAllUsers() {
        try {
            return Array.from(this.cache.validUsers);
        } catch (error) {
            ErrorHandler.logError(error, 'Getting All Users');
            return [];
        }
    }

    async removeUser(username) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            if (this.cache.stats.users[cleanUsername]) {
                delete this.cache.stats.users[cleanUsername];
                this.cache.validUsers.delete(cleanUsername);
                if (this.cache.pendingUpdates) {
                    this.cache.pendingUpdates.add(cleanUsername);
                }
                await this.saveStats();
            }
        } catch (error) {
            ErrorHandler.logError(error, 'Removing User');
            throw error;
        }
    }

    // =======================
    //  Points Management
    // =======================

    async recheckAllPoints(guild) {
        try {
            const users = await this.getAllUsers();
            const processedUsers = [];
            const errors = [];

            const data = await fetchLeaderboardData();
            if (!data?.leaderboard) {
                throw new Error('Failed to fetch leaderboard data');
            }

            for (const username of users) {
                try {
                    // If guild is provided, try to fetch the Discord member
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

                    // Pull user progress from the fetched leaderboard data
                    const userProgress = data.leaderboard.find(
                        u => u.username.toLowerCase() === username.toLowerCase()
                    );

                    if (userProgress) {
                        // Check and apply all achievement-based points
                        await this.processAchievementPoints(username, userProgress);
                        processedUsers.push(username);
                    }
                } catch (error) {
                    console.error(`Error processing ${username}:`, error);
                    errors.push({ username, error: error.message });
                }
            }

            // Force a leaderboard update
            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

            return { processed: processedUsers, errors };
        } catch (error) {
            console.error('Error in recheckAllPoints:', error);
            throw error;
        }
    }

   async processAchievementPoints(username, userProgress) {
        const userStats = this.cache.stats.users[username];
        if (!userStats) return;

        // Get the points manager from services
        if (!this.services?.pointsManager) {
            console.error('[USER STATS] Points manager not available');
            return;
        }

        // Process points for all configured games
        for (const gameId of Object.keys(pointsConfig.monthlyGames)) {
            const gamePoints = await pointChecks.checkGamePoints(
                username,
                userProgress.achievements,
                gameId,
                userStats
            );

            for (const point of gamePoints) {
                await this.services.pointsManager.awardPoints(
                    username, 
                    point.points, 
                    point.reason
                );
            }
        }

        // Update achievement stats
        const currentYear = this.currentYear.toString();
        if (!userStats.monthlyAchievements[currentYear]) {
            userStats.monthlyAchievements[currentYear] = {};
        }

        const monthlyKey = `${currentYear}-${new Date().getMonth()}`;
        userStats.monthlyAchievements[currentYear][monthlyKey] =
            userProgress.completedAchievements;

        userStats.yearlyStats[currentYear].totalAchievementsUnlocked =
            Object.values(userStats.monthlyAchievements[currentYear])
                .reduce((total, count) => total + count, 0);

        this.cache.pendingUpdates.add(username);
    }

    async processRolePoints(username, member) {
        const userStats = this.cache.stats.users[username];
        if (!userStats) return;

        const rolePoints = await pointChecks.checkRolePoints(member, userStats);
        for (const point of rolePoints) {
            await this.addBonusPoints(username, point.points, point.reason);
        }
    }

    // =======================
    //   Leaderboard
    // =======================
    async getYearlyLeaderboard(year = null, allParticipants = []) {
        try {
            const targetYear = year || this.currentYear.toString();
            if (!this.cache.stats.users) return [];

            const leaderboard = Object.entries(this.cache.stats.users)
                .filter(([username]) =>
                    allParticipants.includes(username.toLowerCase())
                )
                .map(([username, stats]) => ({
                    username,
                    points: stats.yearlyPoints?.[targetYear] || 0,
                    gamesBeaten:
                        stats.yearlyStats?.[targetYear]?.gamesBeaten || 0,
                    achievementsUnlocked:
                        stats.yearlyStats?.[targetYear]?.totalAchievementsUnlocked || 0,
                    monthlyParticipations:
                        stats.yearlyStats?.[targetYear]?.monthlyParticipations || 0
                }))
                .sort((a, b) => b.points - a.points || b.gamesBeaten - a.gamesBeaten);

            return leaderboard;
        } catch (error) {
            ErrorHandler.logError(error, 'Getting Yearly Leaderboard');
            return [];
        }
    }

    async archiveLeaderboard(data) {
    try {
        if (!data?.leaderboard || !data?.gameInfo) {
            throw new Error('Invalid leaderboard data for archiving');
        }

        const currentMonth = new Date().toLocaleString('default', { month: 'long' });
        const currentYear = new Date().getFullYear().toString();

        // Build archive entry
        const archiveEntry = {
            month: currentMonth,
            year: currentYear,
            gameInfo: data.gameInfo,
            leaderboard: data.leaderboard.map(user => ({
                username: user.username,
                completedAchievements: user.completedAchievements,
                totalAchievements: user.totalAchievements,
                completionPercentage: user.completionPercentage,
                hasBeatenGame: user.hasBeatenGame
            })),
            date: new Date().toISOString()
        };

        // Save to monthly stats
        if (!this.cache.stats.monthlyStats[currentYear]) {
            this.cache.stats.monthlyStats[currentYear] = {};
        }
        this.cache.stats.monthlyStats[currentYear][currentMonth] = archiveEntry;

        // Add game to history
        await this.database.addGameToHistory({
            ...data.gameInfo,
            month: currentMonth,
            year: currentYear,
            date: archiveEntry.date
        });

        // Force save
        await this.saveStats();

        return {
            month: currentMonth,
            year: currentYear,
            rankings: archiveEntry.leaderboard
        };
    } catch (error) {
        console.error('Error archiving leaderboard:', error);
        throw error;
    }
}


    // =======================
    //     Utility
    // =======================
    async getUserStats(username) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            await this.refreshCache();

            if (!this.cache.stats.users[cleanUsername]) {
                await this.initializeUserIfNeeded(cleanUsername);
            }

            return this.cache.stats.users[cleanUsername] || null;
        } catch (error) {
            ErrorHandler.logError(error, 'Getting User Stats');
            return null;
        }
    }
}

module.exports = UserStats;

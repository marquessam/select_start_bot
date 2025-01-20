// userStats.js

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const ErrorHandler = require('./utils/errorHandler');
const { withTransaction } = require('./utils/transactions');
const { pointsConfig, pointChecks } = require('./pointsConfig');
const { fetchLeaderboardData } = require('./raAPI.js');

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
    this._pendingSaves = new Set();
    this._activeOperations = new Map();
}

    // =======================
    //         Core
    // =======================
    async loadStats(userTracker) {
    if (this.isInitializing) {
        console.log('[USER STATS] Already initializing, waiting...');
        while (this.isInitializing) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return;
    }

    this.isInitializing = true;
    try {
        console.log('[USER STATS] Starting stats load...');
        const dbStats = await this.database.getUserStats();
        
        // Merge or default
        this.cache.stats = {
            users: dbStats.users || {},
            yearlyStats: dbStats.yearlyStats || {},
            monthlyStats: dbStats.monthlyStats || {},
            gamesBeaten: dbStats.gamesBeaten || dbStats.gameCompletions || {},
            achievementStats: dbStats.achievementStats || {},
            communityRecords: dbStats.communityRecords || {}
        };

        const users = await userTracker.getValidUsers();
        this.cache.validUsers = new Set(users.map(u => u.toLowerCase()));

        // Initialize users sequentially to avoid race conditions
        for (const username of this.cache.validUsers) {
            await this.initializeUserIfNeeded(username);
        }

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
}

   async saveStats() {
    const saveId = Date.now().toString();
    this._pendingSaves.add(saveId);
    
    try {
        // Wait for any other pending saves to complete
        while (this._pendingSaves.size > 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('[USER STATS] Saving stats...');
        await this.database.saveUserStats(this.cache.stats);
        this.cache.lastUpdate = Date.now();
        this.cache.pendingUpdates.clear();
        console.log('[USER STATS] Stats saved successfully');
    } catch (error) {
        ErrorHandler.logError(error, 'Saving Stats');
        throw error;
    } finally {
        this._pendingSaves.delete(saveId);
    }
}
    async savePendingUpdates() {
        if (this.cache.pendingUpdates.size > 0) {
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
            this.cache.stats = dbStats;
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

            this.cache.pendingUpdates.add(cleanUsername);

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
                this.cache.pendingUpdates.add(cleanUsername);
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
    async addBonusPoints(username, points, reason) {
    const operationId = `bonus-${username}-${Date.now()}`;
    this._activeOperations.set(operationId, true);

    try {
        // Wait for initialization if needed
        if (!this.initializationComplete) {
            console.log('[USER STATS] Waiting for initialization before adding points...');
            while (!this.initializationComplete) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(
            `[USER STATS] Adding ${points} points to "${username}" for reason: "${reason}"`
        );

        const cleanUsername = username.trim().toLowerCase();
        const user = this.cache.stats.users[cleanUsername];

        if (!user) {
            throw new Error(`User ${username} not found`);
        }

        const year = this.currentYear.toString();

        // Wait for any pending operations for this user
        const userOperations = Array.from(this._activeOperations.entries())
            .filter(([id, _]) => id.includes(cleanUsername));
        if (userOperations.length > 1) {
            console.log(`[USER STATS] Waiting for pending operations for ${cleanUsername}...`);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Initialize arrays and objects if they don't exist
        if (!user.bonusPoints) user.bonusPoints = [];
        if (!user.yearlyPoints) user.yearlyPoints = {};

        // Use transaction for point allocation
        await withTransaction(this.database, async (session) => {
            // If we received a reason object with both display and internal versions
            const displayReason = reason.reason || reason;
            const internalReason = reason.internalReason || reason;
            
            // Add bonus points using internal reason for tracking
            user.bonusPoints.push({
                points,
                reason: internalReason,
                displayReason: displayReason,  // Store display version for UI
                year,
                date: new Date().toISOString()
            });
            
            // Update yearly points
            user.yearlyPoints[year] = (user.yearlyPoints[year] || 0) + points;

            // Save within transaction
            await this.database.db.collection('userstats').updateOne(
                { _id: 'stats' },
                { $set: { [`users.${cleanUsername}`]: user } },
                { session }
            );
        });

        // Update cache
        this.cache.stats.users[cleanUsername] = user;
        this.cache.pendingUpdates.add(cleanUsername);

        // Ensure the cache is saved
        await this.saveStats();

        // Announce the points using the display reason
        if (global.achievementFeed) {
            const displayReason = reason.reason || reason;
            await global.achievementFeed.announcePointsAward(
                username, 
                points, 
                displayReason
            );
        }

        console.log(
            `[USER STATS] Successfully added ${points} points to ${username}`,
            `New total: ${user.yearlyPoints[year]}`
        );

        return true;
    } catch (error) {
        console.error(`[USER STATS] Error adding bonus points to ${username}:`, error);
        ErrorHandler.logError(error, 'Adding Bonus Points');
        throw error;
    } finally {
        this._activeOperations.delete(operationId);
    }
}
    async resetUserPoints(username) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            const user = this.cache.stats.users[cleanUsername];

            if (!user) {
                throw new Error(`User "${username}" not found.`);
            }

            const currentYear = this.currentYear.toString();
            user.yearlyPoints[currentYear] = 0;

            if (user.monthlyAchievements?.[currentYear]) {
                user.monthlyAchievements[currentYear] = {};
            }

            user.bonusPoints = user.bonusPoints.filter(
                bonus => bonus.year !== currentYear
            );

            this.cache.pendingUpdates.add(cleanUsername);
            await this.saveStats();

            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards();
            }
        } catch (error) {
            ErrorHandler.logError(error, 'Resetting User Points');
            throw error;
        }
    }

    async resetAllPoints() {
        try {
            const currentYear = this.currentYear.toString();
            const users = await this.getAllUsers();

            for (const username of users) {
                const user = this.cache.stats.users[username];
                if (user) {
                    user.yearlyPoints[currentYear] = 0;
                    user.bonusPoints = user.bonusPoints.filter(
                        bonus => bonus.year !== currentYear
                    );
                }
            }

            this.cache.pendingUpdates = new Set(users);
            await this.saveStats();

            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

            return users.length;
        } catch (error) {
            console.error('Error resetting all points:', error);
            throw error;
        }
    }

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
                    // Get Discord member if guild provided (for role checks)
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

                    // Get user progress from leaderboard data
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

            // Force leaderboard update
            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

            return {
                processed: processedUsers,
                errors: errors
            };
        } catch (error) {
            console.error('Error in recheckAllPoints:', error);
            throw error;
        }
    }

    async processAchievementPoints(username, userProgress) {
        const userStats = this.cache.stats.users[username];
        if (!userStats) return;

        for (const gameId of Object.keys(pointsConfig.monthlyGames)) {
            const gamePoints = await pointChecks.checkGamePoints(
                username,
                userProgress.achievements,
                gameId,
                userStats
            );

            for (const point of gamePoints) {
                await this.addBonusPoints(
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
        userStats.monthlyAchievements[currentYear][monthlyKey] = userProgress.completedAchievements;

        userStats.yearlyStats[currentYear].totalAchievementsUnlocked =
            Object.values(userStats.monthlyAchievements[currentYear])
                .reduce((total, count) => total + count, 0);

        this.cache.pendingUpdates.add(username);
    }

    async processRolePoints(username, member) {
        const userStats = this.cache.stats.users[username];
        if (!userStats) return;

        const rolePoints = await pointChecks.checkRolePoints(
            member,
            userStats
        );

        for (const point of rolePoints) {
            await this.addBonusPoints(
                username,
                point.points,
                point.reason
            );
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

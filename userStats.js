// userStats.js

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const ErrorHandler = require('./utils/errorHandler');
const path = require('path');
const raGameRules = require(path.join(__dirname, 'raGameRules.json'));
const { withTransaction } = require('./utils/transactions');
const { pointsConfig, pointChecks } = require('./pointsConfig');

// monthlyGames helpers
const {
  monthlyGames,
  getActiveGamesForMonth,
  getCurrentYearMonth
} = require('./monthlyGames'); 

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

        // Periodic save if pending
        setInterval(() => this.savePendingUpdates(), 30000); 
    }

    // =======================
    //         Core
    // =======================
    async loadStats(userTracker) {
        try {
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

            // Initialize missing user entries
            await Promise.all(
                Array.from(this.cache.validUsers).map(username =>
                    this.initializeUserIfNeeded(username)
                )
            );

            await this.saveStats();
            this.cache.lastUpdate = Date.now();
        } catch (error) {
            ErrorHandler.logError(error, 'Loading Stats');
            throw error;
        }
    }

    async saveStats() {
        try {
            await this.database.saveUserStats(this.cache.stats);
            this.cache.lastUpdate = Date.now();
            this.cache.pendingUpdates.clear();
        } catch (error) {
            ErrorHandler.logError(error, 'Saving Stats');
            throw error;
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
    console.log(
        `[DEBUG] addBonusPoints -> awarding ${points} points to "${username}" for reason: "${reason}"`
    );
    try {
        const cleanUsername = username.trim().toLowerCase();
        const user = this.cache.stats.users[cleanUsername];

        if (!user) {
            throw new Error(`User ${username} not found`);
        }

        const year = this.currentYear.toString();

        if (!user.bonusPoints) user.bonusPoints = [];
        if (!user.yearlyPoints) user.yearlyPoints = {};

        // Use transaction for point allocation
        await withTransaction(this.database, async (session) => {
            // Add bonus points
            user.bonusPoints.push({
                points,
                reason,
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
        this.cache.pendingUpdates.add(cleanUsername);

        // Force an immediate leaderboard update if available
       // if (global.leaderboardCache) {
       //     await global.leaderboardCache.updateLeaderboards();
       // }

        // Announce the points if feed is available
        if (global.achievementFeed) {
            await global.achievementFeed.announcePointsAward(username, points, reason);
        }

    } catch (error) {
        ErrorHandler.logError(error, 'Adding Bonus Points');
        throw error;
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
// Add these imports at the top of userStats.js
const { pointsConfig, pointChecks } = require('./pointsConfig');

// Add these new methods to the UserStats class

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

        return users.length; // Return number of users reset
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

                // Get user stats and achievements
                const userStats = await this.getUserStats(username);
                const data = await fetchLeaderboardData();
                const userProgress = data.leaderboard.find(
                    u => u.username.toLowerCase() === username.toLowerCase()
                );

                if (userProgress && userProgress.achievements) {
                    // Check all game-related points
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

                    // Check role-based points if member found
                    if (member) {
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

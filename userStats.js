// userStats.js
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const ErrorHandler = require('./utils/errorHandler');

class UserStats {
    constructor(database) {
        this.database = database;
        this.cache = {
            stats: {
                users: {},
                yearlyStats: {},
                monthlyStats: {},
                gamesBeaten: {}, // Changed from gameCompletions
                achievementStats: {},
                communityRecords: {}
            },
            lastUpdate: null,
            updateInterval: 5 * 60 * 1000, // 5 minutes
            validUsers: new Set(),
            pendingUpdates: new Set() // Track updates that need to be saved
        };
        this.currentYear = new Date().getFullYear();

        // Start periodic cache save if there are pending updates
        setInterval(() => this.savePendingUpdates(), 30000); // Every 30 seconds
    }

    // =======================
    //         Core
    // =======================
    async loadStats(userTracker) {
        try {
            const dbStats = await this.database.getUserStats();

            // Merge or default to empty objects
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

        // If user doesn't exist, initialize their data structure
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

            // If a global leaderboard cache is maintained, update it
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
        try {
            const cleanUsername = username.trim().toLowerCase();
            const user = this.cache.stats.users[cleanUsername];

            if (!user) {
                throw new Error(`User ${username} not found`);
            }

            const year = this.currentYear.toString();

            if (!user.bonusPoints) user.bonusPoints = [];
            if (!user.yearlyPoints) user.yearlyPoints = {};

            user.bonusPoints.push({
                points,
                reason,
                year,
                date: new Date().toISOString()
            });
            user.yearlyPoints[year] = (user.yearlyPoints[year] || 0) + points;

            this.cache.pendingUpdates.add(cleanUsername);
            await this.saveStats();

            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards();
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
    // Achievement Tracking
    // =======================
    async updateMonthlyParticipation(data) {
        try {
            const currentYear = this.currentYear.toString();
            const currentChallenge = await this.database.getCurrentChallenge();
            const currentMonth = new Date().getMonth();
            const participants = data.leaderboard.filter(
                user => user.completedAchievements > 0
            );

            await Promise.all(
                participants.map(async user => {
                    const username = user.username.toLowerCase();
                    if (!this.cache.stats.users[username]) {
                        await this.initializeUserIfNeeded(username);
                    }

                    const userStats = this.cache.stats.users[username];
                    if (!userStats) return;

                    if (!userStats.yearlyStats[currentYear]) {
                        userStats.yearlyStats[currentYear] = {
                            monthlyParticipations: 0,
                            totalAchievementsUnlocked: 0,
                            gamesBeaten: 0
                        };
                    }

                    // Update monthly achievements
                    const monthlyKey = `${currentYear}-${currentMonth}`;
                    if (!userStats.monthlyAchievements[currentYear]) {
                        userStats.monthlyAchievements[currentYear] = {};
                    }

                    if (
                        userStats.monthlyAchievements[currentYear][monthlyKey] !==
                        user.completedAchievements
                    ) {
                        userStats.monthlyAchievements[currentYear][monthlyKey] =
                            user.completedAchievements;

                        userStats.yearlyStats[currentYear].totalAchievementsUnlocked =
                            Object.values(
                                userStats.monthlyAchievements[currentYear]
                            ).reduce((total, count) => total + count, 0);
                    }

                    // Handle participation
                    if (!userStats.participationMonths) {
                        userStats.participationMonths = [];
                    }

                    const participationKey = `${currentYear}-${currentMonth}`;
                    if (!userStats.participationMonths.includes(participationKey)) {
                        userStats.participationMonths.push(participationKey);
                        userStats.yearlyStats[currentYear].monthlyParticipations++;

                        await this.addBonusPoints(
                            username,
                            1,
                            `${currentChallenge.gameName} - participation`
                        );
                    }

                    // Handle beaten game & mastery
                    await this._handleBeatenAndMastery(
                        user,
                        username,
                        currentYear,
                        currentMonth,
                        currentChallenge
                    );

                    this.cache.pendingUpdates.add(username);
                })
            );

            await this.saveStats();
        } catch (error) {
            ErrorHandler.logError(error, 'Updating Monthly Participation');
            throw error;
        }
    }

    /**
     * Unified method for handling "beaten game" logic and "mastery" logic.
     */
    async _handleBeatenAndMastery(
        user,
        username,
        currentYear,
        currentMonth,
        currentChallenge
    ) {
        const userStats = this.cache.stats.users[username];
        if (!userStats) return;

        // -----------------------------
        // Handle "Beaten" Achievement
        // -----------------------------
        const beatAchievement = user.achievements.find(
            ach =>
                (ach.Flags & 2) === 2 && // "beat the game" bit
                parseInt(ach.DateEarned) > 0 && // earned
                currentChallenge &&
                ach.GameID === currentChallenge.gameId
        );

        if (beatAchievement) {
            const beatenKey = `beaten-${currentYear}-${currentMonth}`;
            if (!userStats.beatenMonths) {
                userStats.beatenMonths = [];
            }

            if (!userStats.beatenMonths.includes(beatenKey)) {
                userStats.beatenMonths.push(beatenKey);

                if (!userStats.yearlyStats[currentYear].gamesBeaten) {
                    userStats.yearlyStats[currentYear].gamesBeaten = 0;
                }
                userStats.yearlyStats[currentYear].gamesBeaten += 1;

                await this.addBonusPoints(
                    username,
                    1,
                    `${currentChallenge.gameName} - beaten`
                );
            }
        }

        // -----------------------------
        // Handle "Mastery"
        // -----------------------------
        if (
            user.completedAchievements === user.totalAchievements &&
            user.totalAchievements > 0
        ) {
            const masteryKey = `mastery-${currentYear}-${currentMonth}`;
            if (!Array.isArray(userStats.masteryMonths)) {
                userStats.masteryMonths = [];
            }

            if (!userStats.masteryMonths.includes(masteryKey)) {
                userStats.masteryMonths.push(masteryKey);

                await this.addBonusPoints(
                    username,
                    5,
                    `${currentChallenge.gameName} - mastery`
                );
            }
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


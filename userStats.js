// userStats.js

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const ErrorHandler = require('./utils/errorHandler');
const path = require('path');
const raGameRules = require(path.join(__dirname, 'raGameRules.json'));
const { withTransaction } = require('./utils/transactions');

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

            // Update cache and notify leaderboard
            this.cache.pendingUpdates.add(cleanUsername);
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
            console.log('[DEBUG] Starting updateMonthlyParticipation...');

            const currentYear = this.currentYear.toString();
            const currentChallenge = await this.database.getCurrentChallenge();
            
            // Filter for participants with completedAchievements > 0
            const participants = data.leaderboard.filter(
                user => user.completedAchievements > 0
            );

            console.log(
                `[DEBUG] Found ${participants.length} participant(s) with >= 1 completedAchievements this month.`
            );
            console.log(
                '[DEBUG] Participants:', 
                participants.map(p => p.username)
            );

            // Define list of games to track
            // (Currently: the "currentChallenge" + Mario Tennis + Chrono Trigger)
            const trackedGames = [
                {
                    gameId: currentChallenge.gameId,
                    gameName: currentChallenge.gameName
                },
                {
                    gameId: "10024",
                    gameName: "Mario Tennis (N64)"
                },
                {
                    gameId: "319",
                    gameName: "Chrono Trigger (SNES)"
                }
                // Add more games here as needed
            ];

            await Promise.all(
                participants.map(async user => {
                    const username = user.username.toLowerCase();
                    console.log(
                        `[DEBUG] Processing user "${username}" with ` +
                        `${user.completedAchievements} completed achievements.`
                    );

                    // Ensure user stats exist
                    if (!this.cache.stats.users[username]) {
                        console.log(`[DEBUG] Calling initializeUserIfNeeded for "${username}"`);
                        await this.initializeUserIfNeeded(username);
                    }

                    const userStats = this.cache.stats.users[username];
                    if (!userStats) {
                        console.warn(`[DEBUG] No userStats found for "${username}" after init? Skipping.`);
                        return;
                    }

                    // Initialize yearlyStats if needed
                    if (!userStats.yearlyStats[currentYear]) {
                        console.log(`[DEBUG] Initializing yearlyStats for ${username} in year ${currentYear}`);
                        userStats.yearlyStats[currentYear] = {
                            monthlyParticipations: 0,
                            totalAchievementsUnlocked: 0,
                            gamesBeaten: 0
                        };
                    }

                    // Handle participation for each tracked game
                    for (const game of trackedGames) {
                        console.log(
                            `[DEBUG] Checking participation for "${username}" on gameID: ` +
                            `${game.gameId} - ${game.gameName}`
                        );
                        await this.handleParticipationPoints(
                            user,
                            username,
                            userStats,
                            game.gameId,
                            game.gameName
                        );
                    }

                    // Update monthly achievements
                    if (!userStats.monthlyAchievements[currentYear]) {
                        userStats.monthlyAchievements[currentYear] = {};
                    }

                    const monthlyKey = `${currentYear}-${new Date().getMonth()}`;
                    const prevVal = userStats.monthlyAchievements[currentYear][monthlyKey];
                    if (prevVal !== user.completedAchievements) {
                        console.log(
                            `[DEBUG] Updating monthlyAchievements for ${username}. ` +
                            `OldVal=${prevVal}, NewVal=${user.completedAchievements}`
                        );
                        userStats.monthlyAchievements[currentYear][monthlyKey] =
                            user.completedAchievements;

                        userStats.yearlyStats[currentYear].totalAchievementsUnlocked =
                            Object.values(userStats.monthlyAchievements[currentYear])
                                .reduce((total, count) => total + count, 0);
                    }

                    // Handle beaten and mastery (only for the current challenge game by default)
                    await this._handleBeatenAndMastery(
                        user,
                        username,
                        currentYear,
                        new Date().getMonth(),
                        currentChallenge
                    );

                    this.cache.pendingUpdates.add(username);
                })
            );

            await this.saveStats();
            console.log('[DEBUG] updateMonthlyParticipation completed successfully.');
        } catch (error) {
            console.error('[DEBUG] Error in updateMonthlyParticipation:', error);
            ErrorHandler.logError(error, 'Updating Monthly Participation');
            throw error;
        }
    }

    // ------------------------------------
    // NEW: Handle "Participation Points" with debug logs
    // ------------------------------------
    async handleParticipationPoints(user, username, userStats, gameId, gameName) {
        console.log(
            `[DEBUG] Enter handleParticipationPoints -> user: ${username}, ` +
            `gameId: ${gameId}, gameName: ${gameName}`
        );

        // Filter achievements for this specific game
        const achievementsForGame = (user.achievements ?? []).filter(
            ach => ach.GameID === gameId
        );

        console.log(
            `[DEBUG] Found ${achievementsForGame.length} achievements for gameId ${gameId} ` +
            `in user.achievements. Checking DateEarned...`
        );

        // Check if user earned at least one achievement with DateEarned > 0
        const hasAchievementsForGame = achievementsForGame.some(
            ach => parseInt(ach.DateEarned) > 0
        );

        console.log('[DEBUG] hasAchievementsForGame?', hasAchievementsForGame);

        if (hasAchievementsForGame) {
            console.log(
                `[DEBUG] Awarding 1 point to "${username}" for ` +
                `"${gameName} - monthly participation"`
            );
            try {
                await this.addBonusPoints(
                    username,
                    1,
                    `${gameName} - monthly participation`
                );
            } catch (err) {
                console.error(
                    `[DEBUG] Error awarding participation points to "${username}" ` +
                    `for game "${gameName}" ->`,
                    err
                );
            }

            // Also increment monthlyParticipations count (optional)
            const currentYear = this.currentYear.toString();
            if (typeof userStats.yearlyStats[currentYear].monthlyParticipations !== 'number') {
                userStats.yearlyStats[currentYear].monthlyParticipations = 0;
            }
            userStats.yearlyStats[currentYear].monthlyParticipations += 1;

            console.log(
                `[DEBUG] monthlyParticipations for ${username} is now ` +
                `${userStats.yearlyStats[currentYear].monthlyParticipations}`
            );
        } else {
            console.log(
                `[DEBUG] No achievements with DateEarned > 0 for ` +
                `"${gameName}" in ${username}'s data; skipping participation award.`
            );
        }
    }

    // -----------------------------
    // Unified method for "beaten" game logic and "mastery" logic (ONLY current challenge).
    // If you want to handle "beaten" for side games too,
    // you'd expand the code below or call a new function for them.
    // -----------------------------
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
        // 1) If we have special rules for this game ID in raGameRules
        const ruleSet = raGameRules[currentChallenge.gameId];
        if (ruleSet) {
            // Check progression achievements
            const hasAllProgression = ruleSet.progression?.length
                ? ruleSet.progression.every((achId) =>
                    user.achievements.some(
                        (a) => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                    )
                  )
                : true; // If no progression array, skip

            // Check win condition achievements
            const hasAnyWinCondition = ruleSet.winCondition?.length
                ? ruleSet.winCondition.some((achId) =>
                    user.achievements.some(
                        (a) => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                    )
                  )
                : false;

            if (hasAllProgression && hasAnyWinCondition) {
                // Mark "beaten" if not done this month
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
                        3,
                        `${currentChallenge.gameName} - beaten`
                    );
                }
            }
        } else {
            // Fallback: If no special rules, do your old bit-check logic
            const beatAchievement = user.achievements.find(
                (ach) =>
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
                    3,
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

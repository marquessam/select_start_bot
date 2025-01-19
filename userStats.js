// userStats.js

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const ErrorHandler = require('./utils/errorHandler');
const path = require('path');
const raGameRules = require(path.join(__dirname, 'raGameRules.json'));
const { withTransaction } = require('./utils/transactions');

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
// Monthly Participation (Participation / Beaten / Mastery)
// =======================
async updateMonthlyParticipation(data) {
    try {
        console.log('[DEBUG] Starting updateMonthlyParticipation...', {
            hasData: !!data,
            hasLeaderboard: !!data?.leaderboard
        });

        // Validate input data
        if (!data || !data.leaderboard || !Array.isArray(data.leaderboard)) {
            console.error('[DEBUG] Invalid leaderboard data:', data);
            return;
        }

        const currentYear = this.currentYear.toString();
        // Filter only users who have at least 1 completed achievement in the main scoreboard
        const participants = data.leaderboard.filter(
            user => user && typeof user.completedAchievements === 'number' && 
            user.completedAchievements > 0
        );

        console.log(
            `[DEBUG] Found ${participants.length} participant(s) with >= 1 completedAchievements this month.`
        );

        // Get active games for this month
        const activeGameConfigs = getActiveGamesForMonth();
        const currentYM = getCurrentYearMonth();

        console.log('[DEBUG] Active Game Configs:', JSON.stringify(activeGameConfigs, null, 2));

        // Process each participant
        for (const user of participants) {
            try {
                const username = user.username?.toLowerCase();
                if (!username) {
                    console.warn('[DEBUG] Skipping user with invalid username:', user);
                    continue;
                }

                console.log(`[DEBUG] Processing user "${username}":`);
                console.log(`- Total Achievements: ${user.completedAchievements}/${user.totalAchievements}`);
                console.log(`- Has Beaten Game: ${user.hasBeatenGame}`);
                
                // Ensure user stats exist
                if (!this.cache.stats.users[username]) {
                    await this.initializeUserIfNeeded(username);
                }
                const userStats = this.cache.stats.users[username];
                if (!userStats) {
                    console.warn(`[DEBUG] Could not initialize stats for user: ${username}`);
                    continue;
                }

                // Initialize yearlyStats if needed
                if (!userStats.yearlyStats[currentYear]) {
                    userStats.yearlyStats[currentYear] = {
                        monthlyParticipations: 0,
                        totalAchievementsUnlocked: 0,
                        gamesBeaten: 0
                    };
                }

                // Log the user's earned achievements for debugging
                if (user.achievements) {
                    const earnedAchievements = user.achievements.filter(
                        ach => parseInt(ach.DateEarned) > 0
                    );
                    console.log(
                        `- Earned Achievement IDs: ${earnedAchievements.map(a => a.ID).join(', ')}`
                    );
                }

                // For each active game, run all 3 checks: participation, beaten, mastery
                for (const gameCfg of activeGameConfigs) {
                    const { gameId, gameName } = gameCfg;

                    // 1) Participation check (1 point)
                    await this.handleParticipationPoints(
                        user, 
                        username, 
                        userStats, 
                        gameId, 
                        gameName
                    );

                    // 2) Beaten check (3 points)
                    await this.handleBeaten(
                        user, 
                        username, 
                        userStats, 
                        gameId, 
                        gameName
                    );

                    // 3) Mastery check (3 points)
                    await this.checkMastery(
                        user, 
                        username, 
                        userStats, 
                        gameId, 
                        gameName
                    );
                }

                // Update monthly achievements count
                if (!userStats.monthlyAchievements[currentYear]) {
                    userStats.monthlyAchievements[currentYear] = {};
                }
                const monthlyKey = `${currentYear}-${new Date().getMonth()}`;
                const prevVal = userStats.monthlyAchievements[currentYear][monthlyKey];
                if (prevVal !== user.completedAchievements) {
                    userStats.monthlyAchievements[currentYear][monthlyKey] =
                        user.completedAchievements;
                    
                    userStats.yearlyStats[currentYear].totalAchievementsUnlocked =
                        Object.values(userStats.monthlyAchievements[currentYear])
                            .reduce((total, count) => total + count, 0);
                }

                this.cache.pendingUpdates.add(username);
            } catch (error) {
                console.error(`[DEBUG] Error processing user ${user?.username}:`, error);
            }
        }

        // Save updated stats
        await this.saveStats();
        console.log('[DEBUG] updateMonthlyParticipation completed successfully.');
    } catch (error) {
        console.error('[DEBUG] Error in updateMonthlyParticipation:', error);
        ErrorHandler.logError(error, 'Updating Monthly Participation');
        throw error;
    }
}


// -----------------------------
// Participation (1 point)
// -----------------------------
async handleParticipationPoints(user, username, userStats, gameId, gameName) {
    console.log(`[DEBUG] handleParticipationPoints -> ${username}, game: ${gameId} - ${gameName}`);

    // Filter for only achievements that have a valid GameID
    const gameAchievements = (user.achievements ?? []).filter(ach => {
        if (!ach.GameID) return false; // skip if GameID is missing
        return parseInt(ach.GameID) === parseInt(gameId);
    });

    console.log(`[DEBUG] Found ${gameAchievements.length} achievements for ${username} in ${gameName}`);

    // Check if user has at least one achievement with DateEarned > 0
    const hasProgress = gameAchievements.some(a => parseInt(a.DateEarned) > 0);

    if (hasProgress) {
        const currentYear = this.currentYear.toString();
        const currentMonth = new Date().getMonth();
        const participationKey = `participation-${gameId}-${currentYear}-${currentMonth}`;

        // Ensure tracking object
        if (!userStats.participationTracking) {
            userStats.participationTracking = {};
        }

        // If not awarded this month/game yet
        if (!userStats.participationTracking[participationKey]) {
            console.log(`[DEBUG] Awarding 1 point to "${username}" for ${gameName} participation`);
            await this.addBonusPoints(username, 1, `${gameName} - participation`);
            
            userStats.participationTracking[participationKey] = true;

            // Increment monthlyParticipations
            if (typeof userStats.yearlyStats[currentYear].monthlyParticipations !== 'number') {
                userStats.yearlyStats[currentYear].monthlyParticipations = 0;
            }
            userStats.yearlyStats[currentYear].monthlyParticipations += 1;
        } else {
            console.log(`[DEBUG] ${username} already got participation points for ${gameName} this month`);
        }
    }
}


// -----------------------------
// Beaten (3 points)
// -----------------------------
async handleBeaten(user, username, userStats, gameId, gameName) {
    console.log(`[DEBUG] handleBeaten -> ${username}, game: ${gameId} - ${gameName}`);
    const ruleSet = raGameRules[gameId];

    // Convert user achievements, skipping missing or invalid GameID
    const userAchievements = (user.achievements ?? []).map(ach => {
        const gID = ach.GameID ? parseInt(ach.GameID) : null;
        return {
            id: parseInt(ach.ID),
            dateEarned: parseInt(ach.DateEarned),
            flags: ach.Flags || 0,
            gameId: gID
        };
    });

    let beaten = false;
    if (ruleSet) {
        console.log(`[DEBUG] Checking rule set for ${gameName}:`, ruleSet);

        // Check progression
        let hasAllProgression = true;
        if (ruleSet.progression && ruleSet.progression.length > 0) {
            const earnedProgressionIds = userAchievements
                .filter(a => a.gameId === parseInt(gameId) && a.dateEarned > 0)
                .map(a => a.id);

            hasAllProgression = ruleSet.progression.every(achId =>
                earnedProgressionIds.includes(achId)
            );

            console.log(`[DEBUG] ${username} progression check:`, {
                required: ruleSet.progression,
                earned: earnedProgressionIds,
                hasAll: hasAllProgression
            });
        }

        // Check win condition
        let hasWinCondition = false;
        if (ruleSet.winCondition && ruleSet.winCondition.length > 0) {
            const earnedIds = userAchievements
                .filter(a => a.gameId === parseInt(gameId) && a.dateEarned > 0)
                .map(a => a.id);

            hasWinCondition = ruleSet.winCondition.some(achId =>
                earnedIds.includes(achId)
            );

            console.log(`[DEBUG] ${username} win condition check:`, {
                required: ruleSet.winCondition,
                earned: earnedIds,
                hasWin: hasWinCondition
            });
        }

        beaten = hasAllProgression && hasWinCondition;
        console.log(`[DEBUG] ${username} beaten status for ${gameName}: ${beaten}`);
    } else {
        // Fallback: bit=2 logic
        const beatAchievement = userAchievements.find(a =>
            a.gameId === parseInt(gameId) &&
            (a.flags & 2) === 2 &&
            a.dateEarned > 0
        );
        beaten = !!beatAchievement;
    }

    if (beaten) {
        console.log(`[DEBUG] ${username} has beaten ${gameName}. Checking for prior points...`);

        const currentYear = this.currentYear.toString();
        const currentMonth = new Date().getMonth();

        if (!userStats.beatenMonths) {
            userStats.beatenMonths = [];
        }
        if (!userStats.yearlyStats[currentYear]) {
            userStats.yearlyStats[currentYear] = { gamesBeaten: 0 };
        }

        const beatenKey = `beaten-${gameId}-${currentYear}-${currentMonth}`;
        if (!userStats.beatenMonths.includes(beatenKey)) {
            userStats.beatenMonths.push(beatenKey);

            if (typeof userStats.yearlyStats[currentYear].gamesBeaten !== 'number') {
                userStats.yearlyStats[currentYear].gamesBeaten = 0;
            }
            userStats.yearlyStats[currentYear].gamesBeaten += 1;

            // Always award 3 points for beaten
            const pointsToAward = 3;
            console.log(`[DEBUG] Awarding ${pointsToAward} beaten points to "${username}" for ${gameName}`);
            await this.addBonusPoints(username, pointsToAward, `${gameName} - beaten`);
        } else {
            console.log(`[DEBUG] ${username} already awarded beaten points for ${gameName} this month`);
        }
    }
}


// -----------------------------
// Mastery (5 points)
// -----------------------------
async checkMastery(user, username, userStats, gameId, gameName) {
    console.log(`[DEBUG] checkMastery -> ${username}, game: ${gameId} - ${gameName}`);

    // If you only allow mastery for main monthly challenge
    const currentYM = getCurrentYearMonth();
    const gameConfig = getActiveGamesForMonth().find(cfg =>
        cfg.gameId === gameId && cfg.month === currentYM
    );
    if (!gameConfig?.isMonthlyChallenge) {
        console.log(`[DEBUG] ${gameName} is a side game - skipping mastery check`);
        return;
    }

    // Filter out achievements missing GameID
    const achievementsForGame = (user.achievements ?? []).filter(a => {
        if (!a.GameID) return false;
        return parseInt(a.GameID) === parseInt(gameId);
    });

    const total = achievementsForGame.length;
    if (total === 0) {
        console.log(`[DEBUG] No achievements found for ${gameName}`);
        return;
    }

    const earned = achievementsForGame.filter(a => parseInt(a.DateEarned) > 0).length;
    console.log(`[DEBUG] ${username} mastery check for ${gameName}:`, {
        earned,
        total,
        hasMastery: (earned === total)
    });

    if (earned === total) {
        const currentYear = this.currentYear.toString();
        const currentMonth = new Date().getMonth();

        if (!Array.isArray(userStats.masteryMonths)) {
            userStats.masteryMonths = [];
        }
        const masteryKey = `mastery-${gameId}-${currentYear}-${currentMonth}`;

        if (!userStats.masteryMonths.includes(masteryKey)) {
            console.log(`[DEBUG] Awarding mastery points to "${username}" for ${gameName}`);
            userStats.masteryMonths.push(masteryKey);

            // 3 points for mastery
            const pointsToAward = 3;
            await this.addBonusPoints(username, pointsToAward, `${gameName} - mastery`);
        } else {
            console.log(`[DEBUG] ${username} already awarded mastery for ${gameName} this month`);
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

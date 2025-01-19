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
        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards();
        }

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
    // Monthly Participation
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

                // Log achievement IDs for debugging
                if (user.achievements) {
                    const earnedAchievements = user.achievements.filter(
                        ach => parseInt(ach.DateEarned) > 0
                    );
                    console.log(`- Earned Achievement IDs: ${earnedAchievements.map(a => a.ID).join(', ')}`);
                }

                // Track points awarded this month to avoid duplicates
                const monthlyParticipationKey = `${currentYM}-participation`;
                userStats.participationTracking = userStats.participationTracking || {};
                
                // Process each active game
                for (const gameCfg of activeGameConfigs) {
                    const gameKey = `${monthlyParticipationKey}-${gameCfg.gameId}`;
                    
                    // Skip if we've already awarded participation for this game this month
                    if (userStats.participationTracking[gameKey]) {
                        console.log(`[DEBUG] Already awarded participation for ${gameCfg.gameName} to ${username}`);
                        continue;
                    }

                    // Check if user has any achievements for this game
                    const gameAchievements = user.achievements?.filter(
                        ach => ach && parseInt(ach.GameID) === parseInt(gameCfg.gameId)
                    ) || [];
                    
                    const hasProgress = gameAchievements.some(
                        ach => parseInt(ach.DateEarned) > 0
                    );

                    if (hasProgress) {
                        console.log(`[DEBUG] Awarding participation point to "${username}" for ${gameCfg.gameName}`);
                        await this.addBonusPoints(username, 1, `${gameCfg.gameName} - participation`);
                        userStats.participationTracking[gameKey] = true;
                        
                        if (typeof userStats.yearlyStats[currentYear].monthlyParticipations !== 'number') {
                            userStats.yearlyStats[currentYear].monthlyParticipations = 0;
                        }
                        userStats.yearlyStats[currentYear].monthlyParticipations += 1;
                    }
                }

                // Update monthly achievements count
                if (!userStats.monthlyAchievements[currentYear]) {
                    userStats.monthlyAchievements[currentYear] = {};
                }
                const monthlyKey = `${currentYear}-${new Date().getMonth()}`;
                const prevVal = userStats.monthlyAchievements[currentYear][monthlyKey];
                if (prevVal !== user.completedAchievements) {
                    userStats.monthlyAchievements[currentYear][monthlyKey] = user.completedAchievements;
                    userStats.yearlyStats[currentYear].totalAchievementsUnlocked =
                        Object.values(userStats.monthlyAchievements[currentYear])
                            .reduce((total, count) => total + count, 0);
                }

                this.cache.pendingUpdates.add(username);
            } catch (error) {
                console.error(`[DEBUG] Error processing user ${user?.username}:`, error);
            }
        }

        await this.saveStats();
        console.log('[DEBUG] updateMonthlyParticipation completed successfully.');
    } catch (error) {
        console.error('[DEBUG] Error in updateMonthlyParticipation:', error);
        ErrorHandler.logError(error, 'Updating Monthly Participation');
        throw error;
    }
}
    // -----------------------------
    // 1) PARTICIPATION
    // -----------------------------
    async handleParticipationPoints(user, username, userStats, gameId, gameName) {
        console.log(`[DEBUG] handleParticipationPoints -> ${username}, game: ${gameId} - ${gameName}`);

        // Compare parseInt(ach.GameID) === parseInt(gameId)
        const achievementsForGame = (user.achievements ?? []).filter(
            ach => parseInt(ach.GameID) === parseInt(gameId)
        );

        console.log(`[DEBUG] Found ${achievementsForGame.length} achievements for gameId ${gameId}. Checking DateEarned...`);

        const hasAchievementsForGame = achievementsForGame.some(
            a => parseInt(a.DateEarned) > 0
        );
        console.log('[DEBUG] hasAchievementsForGame?', hasAchievementsForGame);

        if (hasAchievementsForGame) {
            console.log(`[DEBUG] Awarding 1 participation point to "${username}" for ${gameName}.`);
            await this.addBonusPoints(username, 1, `${gameName} - monthly participation`);

            const currentYear = this.currentYear.toString();
            if (typeof userStats.yearlyStats[currentYear].monthlyParticipations !== 'number') {
                userStats.yearlyStats[currentYear].monthlyParticipations = 0;
            }
            userStats.yearlyStats[currentYear].monthlyParticipations += 1;
        }
    }

    // -----------------------------
    // 2) BEATEN
    // -----------------------------
    async handleBeaten(user, username, userStats, gameId, gameName) {
    console.log(`[DEBUG] handleBeaten -> ${username}, game: ${gameId} - ${gameName}`);
    const ruleSet = raGameRules[gameId];

    let beaten = false;
    if (ruleSet) {
        // Check progression
        let hasAllProgression = true;
        if (ruleSet.progression && ruleSet.progression.length > 0) {
            hasAllProgression = ruleSet.progression.every(achId =>
                user.achievements.some(
                    a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                )
            );
        }
        // Check any winCondition
        let hasWinCondition = false;
        if (ruleSet.winCondition && ruleSet.winCondition.length > 0) {
            hasWinCondition = ruleSet.winCondition.some(
                achId => user.achievements.some(
                    a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                )
            );
        }
        if (hasAllProgression && hasWinCondition) {
            beaten = true;
        }
    } else {
        // Fallback: bit=2 logic
        const beatAchievement = user.achievements.find(
            ach =>
                parseInt(ach.GameID) === parseInt(gameId) &&
                (ach.Flags & 2) === 2 &&
                parseInt(ach.DateEarned) > 0
        );
        if (beatAchievement) {
            beaten = true;
        }
    }

    if (beaten) {
        console.log(`[DEBUG] ${username} has beaten ${gameName}. Checking if we've awarded points before...`);

        const currentYear = this.currentYear.toString();
        const currentMonth = new Date().getMonth();
        
        // Initialize user stats structure if needed
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

            // Find game config to determine points
            const currentYM = getCurrentYearMonth();
            const gameConfig = getActiveGamesForMonth().find(cfg => 
                cfg.gameId === gameId && cfg.month === currentYM
            );

            // Award appropriate points based on if it's main challenge or side game
            const pointsToAward = gameConfig?.isMonthlyChallenge ? 3 : 1;
            console.log(`[DEBUG] Awarding ${pointsToAward} beaten points to "${username}" for ${gameName}.`);
            await this.addBonusPoints(username, pointsToAward, `${gameName} - beaten`);
        }
    }
}
  
    // -----------------------------
    // 3) MASTERY
    // -----------------------------
    async checkMastery(user, username, userStats, gameId, gameName) {
        console.log(`[DEBUG] checkMastery -> ${username}, game: ${gameId} - ${gameName}`);

        const achievementsForGame = (user.achievements ?? []).filter(
            a => parseInt(a.GameID) === parseInt(gameId)
        );
        const total = achievementsForGame.length;
        if (total === 0) {
            console.log('[DEBUG] No achievements found for this game in user data; cannot be mastered.');
            return;
        }
        const earned = achievementsForGame.filter(a => parseInt(a.DateEarned) > 0).length;

        if (earned === total) {
            // user has them all
            const currentYear = this.currentYear.toString();
            const currentMonth = new Date().getMonth();

            if (!Array.isArray(userStats.masteryMonths)) {
                userStats.masteryMonths = [];
            }
            const masteryKey = `mastery-${gameId}-${currentYear}-${currentMonth}`;

            if (!userStats.masteryMonths.includes(masteryKey)) {
                console.log(`[DEBUG] Awarding mastery points to "${username}" for ${gameName}.`);
                userStats.masteryMonths.push(masteryKey);

                // e.g. award 3 points
                await this.addBonusPoints(username, 3, `${gameName} - mastery`);
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

// userStats.js

class UserStats {
    constructor(database, pointsManager) {
        this.database = database;
        this.pointsManager = pointsManager;
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
        this._initializingPromise = null;
        this._savePromise = null;
        this._pendingSaves = new Set();
        this._activeOperations = new Map();
    }

    async loadStats(userTracker) {
        if (this.isInitializing) {
            console.log('[USER STATS] Already initializing, returning existing init promise...');
            return this._initializingPromise;
        }

        this.isInitializing = true;

        this._initializingPromise = (async () => {
            try {
                console.log('[USER STATS] Starting stats load...');
                const dbStats = await this.database.getUserStats();

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

                for (const username of this.cache.validUsers) {
                    await this.initializeUserIfNeeded(username);
                }

                await this.saveStats();
                this.cache.lastUpdate = Date.now();
                this.initializationComplete = true;

                console.log('[USER STATS] Stats load complete');
            } catch (error) {
                console.error('[USER STATS] Error loading stats:', error);
                throw error;
            } finally {
                this.isInitializing = false;
            }
        })();

        return this._initializingPromise;
    }

    async saveStats() {
        if (this._savePromise) {
            console.log('[USER STATS] Another save is in progress, waiting...');
            await this._savePromise;
        }

        const saveId = Date.now().toString();
        this._pendingSaves.add(saveId);

        this._savePromise = (async () => {
            try {
                console.log('[USER STATS] Saving stats...');
                await this.database.saveUserStats(this.cache.stats);
                this.cache.lastUpdate = Date.now();
                this.cache.pendingUpdates.clear();
                console.log('[USER STATS] Stats saved successfully');
            } catch (error) {
                console.error('[USER STATS] Error saving stats:', error);
                throw error;
            } finally {
                this._pendingSaves.delete(saveId);
                this._savePromise = null;
            }
        })();

        return this._savePromise;
    }

    async savePendingUpdates() {
        if (this.cache.pendingUpdates.size > 0) {
            await this.saveStats();
        }
    }

    async refreshCache() {
        if (this.shouldRefreshCache()) {
            try {
                const dbStats = await this.database.getUserStats();
                this.cache.stats = dbStats;
                this.cache.lastUpdate = Date.now();
            } catch (error) {
                console.error('[USER STATS] Error refreshing cache:', error);
            }
        }
    }

    shouldRefreshCache() {
        return !this.cache.lastUpdate || 
               (Date.now() - this.cache.lastUpdate > this.cache.updateInterval);
    }

    async initializeUserIfNeeded(username) {
        if (!username) return;
        const cleanUsername = username.trim().toLowerCase();
        if (!cleanUsername) return;

        if (!this.cache.stats.users[cleanUsername]) {
            this.cache.stats.users[cleanUsername] = {
                yearlyStats: {},
                completedGames: {},
                monthlyAchievements: {},
                yearlyPoints: {}
            };

            const currentYear = this.currentYear.toString();
            
            // Initialize yearly stats
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
            console.error('[USER STATS] Error removing user:', error);
            throw error;
        }
    }

    async processAchievementPoints(username, achievements, gameId) {
        try {
            const pointsToAward = await this.pointsManager.checkGamePoints(username, achievements, gameId);
            
            for (const point of pointsToAward) {
                await this.pointsManager.awardPoints(
                    username,
                    point.points,
                    point.reason,
                    gameId
                );
            }

            // Update achievement stats
            const currentYear = this.currentYear.toString();
            const user = this.cache.stats.users[username.toLowerCase()];
            
            if (user) {
                const monthlyKey = `${currentYear}-${new Date().getMonth()}`;
                if (!user.monthlyAchievements[currentYear]) {
                    user.monthlyAchievements[currentYear] = {};
                }
                
                user.monthlyAchievements[currentYear][monthlyKey] = 
                    achievements.filter(a => parseInt(a.DateEarned) > 0).length;

                user.yearlyStats[currentYear].totalAchievementsUnlocked =
                    Object.values(user.monthlyAchievements[currentYear])
                        .reduce((total, count) => total + count, 0);

                this.cache.pendingUpdates.add(username.toLowerCase());
            }

            return pointsToAward.length > 0;
        } catch (error) {
            console.error('[USER STATS] Error processing achievement points:', error);
            return false;
        }
    }

    async recheckAllPoints(guild) {
        try {
            const validUsers = await this.getAllUsers();
            const processedUsers = [];
            const errors = [];

            for (const username of validUsers) {
                try {
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

                    await this.processUserPoints(username, member);
                    processedUsers.push(username);
                } catch (error) {
                    console.error(`Error processing ${username}:`, error);
                    errors.push({ username, error: error.message });
                }
            }

            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

            return { processed: processedUsers, errors };
        } catch (error) {
            console.error('[USER STATS] Error in recheckAllPoints:', error);
            throw error;
        }
    }

    async archiveLeaderboard(data) {
        try {
            if (!data?.leaderboard || !data?.gameInfo) {
                throw new Error('Invalid leaderboard data for archiving');
            }

            const currentMonth = new Date().toLocaleString('default', { month: 'long' });
            const currentYear = this.currentYear.toString();

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

            if (!this.cache.stats.monthlyStats[currentYear]) {
                this.cache.stats.monthlyStats[currentYear] = {};
            }
            
            this.cache.stats.monthlyStats[currentYear][currentMonth] = archiveEntry;

            await this.database.addGameToHistory({
                ...data.gameInfo,
                month: currentMonth,
                year: currentYear,
                date: archiveEntry.date
            });

            await this.saveStats();

            return {
                month: currentMonth,
                year: currentYear,
                rankings: archiveEntry.leaderboard
            };
        } catch (error) {
            console.error('[USER STATS] Error archiving leaderboard:', error);
            throw error;
        }
    }

    async getYearlyLeaderboard(year = null, allParticipants = []) {
        try {
            const targetYear = year || this.currentYear.toString();
            if (!this.cache.stats.users) return [];

            const leaderboard = await Promise.all(
                Object.entries(this.cache.stats.users)
                    .filter(([username]) => allParticipants.includes(username.toLowerCase()))
                    .map(async ([username, stats]) => {
                        const bonusPoints = await this.pointsManager.getUserPoints(username, targetYear);
                        const totalPoints = bonusPoints.reduce((sum, p) => sum + p.points, 0);

                        return {
                            username,
                            points: totalPoints,
                            gamesBeaten: stats.yearlyStats?.[targetYear]?.gamesBeaten || 0,
                            achievementsUnlocked: stats.yearlyStats?.[targetYear]?.totalAchievementsUnlocked || 0,
                            monthlyParticipations: stats.yearlyStats?.[targetYear]?.monthlyParticipations || 0
                        };
                    })
            );

            return leaderboard.sort((a, b) => b.points - a.points || b.gamesBeaten - a.gamesBeaten);
        } catch (error) {
            console.error('[USER STATS] Error getting yearly leaderboard:', error);
            return [];
        }
    }

    async getAllUsers() {
        try {
            return Array.from(this.cache.validUsers);
        } catch (error) {
            console.error('[USER STATS] Error getting all users:', error);
            return [];
        }
    }

    async getUserStats(username) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            await this.refreshCache();

            if (!this.cache.stats.users[cleanUsername]) {
                await this.initializeUserIfNeeded(cleanUsername);
            }

            return this.cache.stats.users[cleanUsername] || null;
        } catch (error) {
            console.error('[USER STATS] Error getting user stats:', error);
            return null;
        }
    }
}

module.exports = UserStats;

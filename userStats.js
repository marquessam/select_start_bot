const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class UserStats {
    constructor(database) {
        this.database = database;
        this.stats = {
            users: {},
            yearlyStats: {},
            monthlyStats: {},
            gameCompletions: {},
            achievementStats: {},
            communityRecords: {}
        };
        this.currentYear = new Date().getFullYear();
    }

    async getAllUsers() {
        try {
            return await this.database.getValidUsers();
        } catch (error) {
            console.error('Error fetching valid users:', error);
            return [];
        }
    }

    async removeUser(username) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            if (this.stats.users[cleanUsername]) {
                delete this.stats.users[cleanUsername];
                await this.saveStats();
                console.log(`User "${username}" removed successfully.`);
            } else {
                console.log(`User "${username}" not found.`);
            }
        } catch (error) {
            console.error('Error removing user:', error);
            throw error;
        }
    }

    async loadStats(userTracker) {
        try {
            // Initialize stats with existing database data
            const dbStats = await this.database.getUserStats();

            this.stats = {
                users: dbStats.users || {},
                yearlyStats: dbStats.yearlyStats || {},
                monthlyStats: dbStats.monthlyStats || {},
                gameCompletions: dbStats.gameCompletions || {},
                achievementStats: dbStats.achievementStats || {},
                communityRecords: dbStats.communityRecords || {},
            };

            // Use UserTracker to get valid users
            const users = await userTracker.getValidUsers();
            console.log('Found users:', users);

            for (const username of users) {
                await this.initializeUserIfNeeded(username);
            }

            await this.saveStats();
            console.log('Stats loaded and synchronized with UserTracker');
        } catch (error) {
            console.error('Error loading or synchronizing stats:', error);
            throw error;
        }
    }

    async initializeUserIfNeeded(username) {
        if (!username) return;

        const cleanUsername = username.trim().toLowerCase();
        if (!cleanUsername) return;

        // Check if user exists and needs initialization
        if (!this.stats.users[cleanUsername]) {
            console.log(`Initializing stats for new user: ${cleanUsername}`);
            
            // Create base user structure
            this.stats.users[cleanUsername] = {
                yearlyPoints: {},
                completedGames: {},
                monthlyAchievements: {},
                yearlyStats: {},
                participationMonths: [],
                completionMonths: [],
                masteryMonths: [],
                bonusPoints: []
            };

            // Initialize current year stats
            const currentYear = this.currentYear.toString();
            this.stats.users[cleanUsername].yearlyPoints[currentYear] = 0;
            this.stats.users[cleanUsername].yearlyStats[currentYear] = {
                monthlyParticipations: 0,
                totalAchievementsUnlocked: 0,
                totalGamesCompleted: 0
            };

            // Save immediately after initialization
            await this.saveStats();
            console.log(`Successfully initialized stats for user: ${cleanUsername}`);
            
            // Update leaderboard cache if it exists
            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards();
            }
        }
    }

    async saveStats() {
        try {
            await this.database.saveUserStats(this.stats);
        } catch (error) {
            console.error('Error saving stats to database:', error);
            throw error;
        }
    }

    async getYearlyLeaderboard(year = null, allParticipants = []) {
        try {
            console.log('[DEBUG] getYearlyLeaderboard called');
            const targetYear = year || this.currentYear.toString();

            if (!this.stats.users) {
                console.log('[DEBUG] No user data available, returning empty leaderboard');
                return [];
            }

            const leaderboard = Object.entries(this.stats.users)
                .map(([username, stats]) => ({
                    username,
                    points: stats.yearlyPoints[targetYear] || 0,
                    gamesCompleted: stats.yearlyStats?.[targetYear]?.totalGamesCompleted || 0,
                    achievementsUnlocked: stats.yearlyStats?.[targetYear]?.totalAchievementsUnlocked || 0,
                    monthlyParticipations: stats.yearlyStats?.[targetYear]?.monthlyParticipations || 0,
                }))
                .filter(entry => allParticipants.includes(entry.username.toLowerCase()));

            console.log('[DEBUG] Generated leaderboard:', leaderboard);
            return leaderboard.sort((a, b) =>
                b.points - a.points || b.gamesCompleted - a.gamesCompleted
            );
        } catch (error) {
            console.error('Error in getYearlyLeaderboard:', error);
            return [];
        }
    }

    async updateMonthlyParticipation(data) {
        try {
            const currentYear = new Date().getFullYear().toString();
            const currentChallenge = await this.database.getCurrentChallenge();

            const participants = data.leaderboard.filter(user => user.completedAchievements > 0);

            for (const user of participants) {
                const username = user.username.toLowerCase();
                if (!this.stats.users[username]) {
                    await this.initializeUserIfNeeded(username);
                }

                const userStats = this.stats.users[username];
                if (!userStats) continue;

                if (!userStats.yearlyStats[currentYear]) {
                    userStats.yearlyStats[currentYear] = {
                        monthlyParticipations: 0,
                        totalAchievementsUnlocked: 0,
                        totalGamesCompleted: 0
                    };
                }

                const currentMonth = new Date().getMonth();
                const monthlyKey = `${currentYear}-${currentMonth}`;

                if (!userStats.monthlyAchievements[currentYear]) {
                    userStats.monthlyAchievements[currentYear] = {};
                }

                if (userStats.monthlyAchievements[currentYear][monthlyKey] !== user.completedAchievements) {
                    userStats.monthlyAchievements[currentYear][monthlyKey] = user.completedAchievements;
                    userStats.yearlyStats[currentYear].totalAchievementsUnlocked =
                        Object.values(userStats.monthlyAchievements[currentYear])
                            .reduce((total, count) => total + count, 0);
                }

                const participationKey = `${currentYear}-${currentMonth}`;
                if (!userStats.participationMonths) {
                    userStats.participationMonths = [];
                }

                if (!userStats.participationMonths.includes(participationKey)) {
                    userStats.participationMonths.push(participationKey);
                    userStats.yearlyStats[currentYear].monthlyParticipations++;
                    await this.addBonusPoints(username, 1, `${currentChallenge.gameName} - participation`);
                }

                // Check for completion achievements
                this._handleCompletionAndMastery(user, username, currentYear, currentMonth, currentChallenge);
            }

            await this.saveStats();
        } catch (error) {
            console.error('Error updating monthly participation:', error);
            throw error;
        }
    }

    async _handleCompletionAndMastery(user, username, currentYear, currentMonth, currentChallenge) {
        const userStats = this.stats.users[username];
        
        if (user.hasCompletion) {
            const completionKey = `completion-${currentYear}-${currentMonth}`;
            if (!userStats.completionMonths) {
                userStats.completionMonths = [];
            }

            if (!userStats.completionMonths.includes(completionKey)) {
                userStats.completionMonths.push(completionKey);
                await this.addBonusPoints(username, 1, `${currentChallenge.gameName} - completion`);
            }
        }

        if (user.completedAchievements === user.totalAchievements && user.totalAchievements > 0) {
            const masteryKey = `mastery-${currentYear}-${currentMonth}`;
            if (!userStats.masteryMonths) {
                userStats.masteryMonths = [];
            }

            if (!userStats.masteryMonths.includes(masteryKey)) {
                userStats.masteryMonths.push(masteryKey);
                await this.addBonusPoints(username, 5, `${currentChallenge.gameName} - mastery`);
            }
        }
    }

    async addBonusPoints(username, points, reason) {
        try {
            console.log(`Adding bonus points to: ${username}`);

            const cleanUsername = username.trim().toLowerCase();
            const user = this.stats.users[cleanUsername];

            if (!user) {
                throw new Error(`User ${username} not found`);
            }

            const year = this.currentYear.toString();

            if (!user.bonusPoints) {
                user.bonusPoints = [];
            }
            
            if (!user.yearlyPoints) {
                user.yearlyPoints = {};
            }

            user.bonusPoints.push({ points, reason, year, date: new Date().toISOString() });
            user.yearlyPoints[year] = (user.yearlyPoints[year] || 0) + points;

            await this.saveStats();
            console.log(`Successfully added ${points} points to ${username} for ${reason}`);

            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards();
            }
        } catch (error) {
            console.error('Error in addBonusPoints:', error);
            throw error;
        }
    }

    async getUserStats(username) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            if (!this.stats.users[cleanUsername]) {
                await this.initializeUserIfNeeded(cleanUsername);
            }
            return this.stats.users[cleanUsername] || null;
        } catch (error) {
            console.error('Error in getUserStats:', error);
            throw error;
        }
    }

    async resetUserPoints(username) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            const user = this.stats.users[cleanUsername];

            if (!user) {
                throw new Error(`User "${username}" not found.`);
            }

            const currentYear = new Date().getFullYear().toString();
            user.yearlyPoints[currentYear] = 0;

            if (user.monthlyAchievements && user.monthlyAchievements[currentYear]) {
                user.monthlyAchievements[currentYear] = {};
            }

            user.bonusPoints = user.bonusPoints.filter(bonus => bonus.year !== currentYear);

            await this.saveStats();
            console.log(`Points reset for user: ${username}`);
            
            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards();
            }
        } catch (error) {
            console.error('Error resetting user points:', error);
            throw error;
        }
    }
}

module.exports = UserStats;

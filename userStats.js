const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const database = require('./database');

class UserStats {
    constructor() {
        this.stats = {
            users: {},
            yearlyStats: {},
            monthlyStats: {},
            gameCompletions: {},
            achievementStats: {},
            communityRecords: {}
        };
        this.currentYear = new Date().getFullYear();
        this.SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRt6MiNALBT6jj0hG5qtalI_GkSkXFaQvWdRj-Ye-l3YNU4DB5mLUQGHbLF9-XnhkpJjLEN9gvTHXmp/pub?gid=0&single=true&output=csv';
    }
    
    async getAllUsers() {
        try {
            if (!this.stats || !this.stats.users) {
                console.warn('User data not initialized. Returning empty list.');
                return [];
            }
            return Object.keys(this.stats.users).map(user => user.toLowerCase());
        } catch (error) {
            console.error('Error fetching all users:', error);
            throw error;
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
    
    async loadStats() {
        try {
            const dbStats = await database.getUserStats();

            this.stats = {
                users: dbStats.users || {},
                yearlyStats: dbStats.yearlyStats || {},
                monthlyStats: dbStats.monthlyStats || {},
                gameCompletions: dbStats.gameCompletions || {},
                achievementStats: dbStats.achievementStats || {},
                communityRecords: dbStats.communityRecords || {}
            };

            const response = await fetch(this.SPREADSHEET_URL);
            const csvText = await response.text();

            const users = csvText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .slice(1);

            console.log('Found users:', users);

            for (const username of users) {
                await this.initializeUserIfNeeded(username);
            }

            await this.saveStats();
            console.log('Stats loaded and synchronized with spreadsheet');

        } catch (error) {
            console.error('Error loading or synchronizing stats:', error);
            throw error;
        }
    }

    async refreshUserList() {
        try {
            const response = await fetch(this.SPREADSHEET_URL);
            const csvText = await response.text();

            const users = csvText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .slice(1);

            for (const username of users) {
                await this.initializeUserIfNeeded(username);
            }

            await this.saveStats();
            return users;
        } catch (error) {
            console.error('Error refreshing user list:', error);
            throw error;
        }
    }

    async initializeUserIfNeeded(username) {
        if (!username) return;

        const cleanUsername = username.trim().toLowerCase();
        if (!cleanUsername) return;

        const year = this.currentYear.toString();

        if (!this.stats.users[cleanUsername]) {
            this.stats.users[cleanUsername] = {
                totalPoints: 0,
                yearlyPoints: {},
                monthlyAchievements: {},
                bonusPoints: [],
                completedGames: {},
                monthlyStats: {},
                yearlyStats: {},
                achievements: {
                    titles: [],
                    badges: [],
                    milestones: [],
                    specialUnlocks: [],
                    records: [],
                    streaks: {
                        current: 0,
                        longest: 0,
                        lastUpdate: null
                    }
                }
            };
        }

        const userStats = this.stats.users[cleanUsername];

        if (!userStats.yearlyPoints[year]) {
            userStats.yearlyPoints[year] = 0;
        }

        if (!userStats.completedGames[year]) {
            userStats.completedGames[year] = [];
        }

        if (!userStats.monthlyStats[year]) {
            userStats.monthlyStats[year] = {};
        }

        if (!userStats.yearlyStats[year]) {
            userStats.yearlyStats[year] = {
                totalGamesCompleted: 0,
                totalAchievementsUnlocked: 0,
                hardcoreCompletions: 0,
                softcoreCompletions: 0,
                monthlyParticipations: 0,
                perfectMonths: 0,
                totalPoints: 0,
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
                dailyActivity: {},
                hardestGame: ""
            };
        }

        if (!userStats.monthlyAchievements[year]) {
            userStats.monthlyAchievements[year] = {};
        }

        return this.saveStats();
    }

    async saveStats() {
        try {
            await database.saveUserStats(this.stats);
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
            const currentChallenge = await database.getCurrentChallenge();

            const participants = data.leaderboard.filter(user => user.completedAchievements > 0);

            for (const user of participants) {
                const username = user.username.toLowerCase();
                if (!this.stats.users[username]) continue;

                if (!this.stats.users[username].yearlyStats[currentYear]) {
                    this.stats.users[username].yearlyStats[currentYear] = {
                        monthlyParticipations: 0
                    };
                }

                const currentMonth = new Date().getMonth();
                const participationKey = `${currentYear}-${currentMonth}`;
                
                if (!this.stats.users[username].participationMonths) {
                    this.stats.users[username].participationMonths = [];
                }

                if (!this.stats.users[username].participationMonths.includes(participationKey)) {
                    this.stats.users[username].participationMonths.push(participationKey);
                    this.stats.users[username].yearlyStats[currentYear].monthlyParticipations++;
                    
                    await this.addBonusPoints(
                        username, 
                        1, 
                        `${currentChallenge.gameName} - participation`
                    );

                    console.log(`Updated participation for ${username}: ${this.stats.users[username].yearlyStats[currentYear].monthlyParticipations}`);
                }

                if (user.hasCompletion) {
                    const completionKey = `completion-${currentYear}-${currentMonth}`;
                    if (!this.stats.users[username].completionMonths) {
                        this.stats.users[username].completionMonths = [];
                    }

                    if (!this.stats.users[username].completionMonths.includes(completionKey)) {
                        this.stats.users[username].completionMonths.push(completionKey);
                        await this.addBonusPoints(
                            username,
                            1,
                            `${currentChallenge.gameName} - completion`
                        );
                    }
                }

                if (user.completedAchievements === user.totalAchievements && user.totalAchievements > 0) {
                    const masteryKey = `mastery-${currentYear}-${currentMonth}`;
                    if (!this.stats.users[username].masteryMonths) {
                        this.stats.users[username].masteryMonths = [];
                    }

                    if (!this.stats.users[username].masteryMonths.includes(masteryKey)) {
                        this.stats.users[username].masteryMonths.push(masteryKey);
                        await this.addBonusPoints(
                            username,
                            5,
                            `${currentChallenge.gameName} - mastery`
                        );
                    }
                }
            }

            await this.saveStats();
        } catch (error) {
            console.error('Error updating monthly participation:', error);
        }
    }
    
    async addBonusPoints(username, points, reason) {
        try {
            console.log('Adding bonus points to:', username);

            await this.refreshUserList();

            const cleanUsername = username.trim().toLowerCase();
            const user = this.stats.users[cleanUsername];

            if (!user) {
                throw new Error(`User ${username} not found`);
            }

            const year = this.currentYear.toString();

            if (!user.bonusPoints) {
                user.bonusPoints = [];
            }
            user.bonusPoints.push({ points, reason, year, date: new Date().toISOString() });

            user.yearlyPoints[year] = (user.yearlyPoints[year] || 0) + points;

            await this.saveStats();
            console.log(`Successfully added ${points} points to ${username} for ${reason}`);
        } catch (error) {
            console.error('Error in addBonusPoints:', error);
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
        } catch (error) {
            console.error('Error resetting user points:', error);
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
}

module.exports = UserStats;

module.exports = UserStats;

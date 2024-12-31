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

    async loadStats() {
        try {
            // Load stats from MongoDB
            const dbStats = await database.getUserStats();

            // Merge with default structure
            this.stats = {
                users: dbStats.users || {},
                yearlyStats: dbStats.yearlyStats || {},
                monthlyStats: dbStats.monthlyStats || {},
                gameCompletions: dbStats.gameCompletions || {},
                achievementStats: dbStats.achievementStats || {},
                communityRecords: dbStats.communityRecords || {}
            };

            // Fetch and sync users from spreadsheet
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

        // Initialize user if they don't exist
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

        // Initialize year structures
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

        await this.saveStats();
    }

    async saveStats() {
        try {
            await database.saveUserStats(this.stats);
        } catch (error) {
            console.error('Error saving stats to database:', error);
            throw error;
        }
    }

    async getYearlyLeaderboard(year = null) {
        try {
            const targetYear = year || this.currentYear.toString();

            // Ensure users data is refreshed and up-to-date
            await this.refreshUserList();

            // Map users to leaderboard entries
            const leaderboard = Object.entries(this.stats.users).map(([username, stats]) => ({
                username,
                points: stats.yearlyPoints[targetYear] || 0,
                gamesCompleted: stats.yearlyStats?.[targetYear]?.totalGamesCompleted || 0,
                achievementsUnlocked: stats.yearlyStats?.[targetYear]?.totalAchievementsUnlocked || 0,
                monthlyParticipations: stats.yearlyStats?.[targetYear]?.monthlyParticipations || 0,
            }));

            // Sort by points, then by games completed as a tiebreaker
            return leaderboard.sort((a, b) =>
                b.points - a.points || b.gamesCompleted - a.gamesCompleted
            );
        } catch (error) {
            console.error('Error in getYearlyLeaderboard:', error);
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

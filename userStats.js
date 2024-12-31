const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const database = require('./database');

class UserStats {
    constructor() {
        this.stats = {
            users: {},
            yearlyStats: {},
            monthlyStats: {},
            gameCompletions: {}
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
                gameCompletions: dbStats.gameCompletions || {}
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

    async initializeUserIfNeeded(username) {
    if (!username) return;

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) return;

    const year = this.currentYear.toString();

    // Ensure the user object exists
    if (!this.stats.users[cleanUsername]) {
        this.stats.users[cleanUsername] = {
            totalPoints: 0,
            yearlyPoints: {},
            monthlyAchievements: {},
            bonusPoints: [],
            completedGames: {},
            monthlyStats: {},
            yearlyStats: {}
        };
    }

    const userStats = this.stats.users[cleanUsername];

    // Ensure yearlyPoints for the current year exists
    if (!userStats.yearlyPoints) userStats.yearlyPoints = {};
    if (!userStats.yearlyPoints[year]) {
        userStats.yearlyPoints[year] = 0;
    }

    // Ensure completedGames for the current year exists
    if (!userStats.completedGames) userStats.completedGames = {};
    if (!userStats.completedGames[year]) {
        userStats.completedGames[year] = [];
    }

    // Ensure monthlyStats for the current year exists
    if (!userStats.monthlyStats) userStats.monthlyStats = {};
    if (!userStats.monthlyStats[year]) {
        userStats.monthlyStats[year] = {};
    }

    // Ensure yearlyStats for the current year exists
    if (!userStats.yearlyStats) userStats.yearlyStats = {};
    if (!userStats.yearlyStats[year]) {
        userStats.yearlyStats[year] = {
            totalGamesCompleted: 0,
            totalAchievementsUnlocked: 0,
            hardcoreCompletions: 0,
            softcoreCompletions: 0,
            monthlyParticipations: 0,
            perfectMonths: 0
        };
    }

    // Ensure monthlyAchievements for the current year exists
    if (!userStats.monthlyAchievements) userStats.monthlyAchievements = {};
    if (!userStats.monthlyAchievements[year]) {
        userStats.monthlyAchievements[year] = {};
    }

    await this.saveStats();
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

    async saveStats() {
        try {
            await database.saveUserStats(this.stats);
        } catch (error) {
            console.error('Error saving stats to database:', error);
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
            console.log('Fetching stats for user:', username);

            const cleanUsername = username.trim().toLowerCase();
            await this.refreshUserList();

            if (!this.stats.users[cleanUsername]) {
                await this.initializeUserIfNeeded(cleanUsername);
            }

            return this.stats.users[cleanUsername] || null;
        } catch (error) {
            console.error('Error retrieving user stats:', error);
            throw error;
        }
    }
}

module.exports = UserStats;

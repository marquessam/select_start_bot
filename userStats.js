// userStats.js
const fs = require('fs').promises;
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class UserStats {
    constructor() {
        this.dbPath = path.join(__dirname, 'userStats.json');
        this.stats = null;
        this.currentYear = new Date().getFullYear();
        this.SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRt6MiNALBT6jj0hG5qtalI_GkSkXFaQvWdRj-Ye-l3YNU4DB5mLUQGHbLF9-XnhkpJjLEN9gvTHXmp/pub?gid=0&single=true&output=csv';
    }

    async resetUserPoints(username) {
    try {
        await this.initializeUserIfNeeded(username);
        
        const currentYear = new Date().getFullYear().toString();
        
        // Reset all point-related data
        this.stats.users[username] = {
            totalPoints: 0,
            yearlyPoints: {
                [currentYear]: 0
            },
            monthlyAchievements: {},
            bonusPoints: []
        };

        await this.saveStats();
        return true;
    } catch (error) {
        console.error('Error resetting user points:', error);
        throw error;
    }
}
    async loadStats() {
        try {
            // First load existing stats if they exist
            try {
                const data = await fs.readFile(this.dbPath, 'utf8');
                this.stats = JSON.parse(data);
            } catch (error) {
                this.stats = {
                    users: {},
                    yearlyStats: {},
                    monthlyStats: {}
                };
            }

            // Fetch users from spreadsheet
            const response = await fetch(this.SPREADSHEET_URL);
            const csvText = await response.text();
            
            // Parse CSV and get usernames
            const users = csvText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .slice(1); // Remove header row

            // Initialize each user from the spreadsheet
            for (const username of users) {
                await this.initializeUserIfNeeded(username);
            }

            // Save the updated stats
            await this.saveStats();
            console.log('Stats loaded and synchronized with spreadsheet');
            
        } catch (error) {
            console.error('Error loading or synchronizing stats:', error);
            throw error;
        }
    }

    async saveStats() {
        await fs.writeFile(this.dbPath, JSON.stringify(this.stats, null, 2));
    }

    async initializeUserIfNeeded(username) {
        if (!username) return; // Skip empty usernames
        
        // Clean up username
        const cleanUsername = username.trim();
        if (!cleanUsername) return;

        if (!this.stats.users[cleanUsername]) {
            this.stats.users[cleanUsername] = {
                totalPoints: 0,
                yearlyPoints: {},
                monthlyAchievements: {},
                bonusPoints: []
            };
        }

        const year = this.currentYear.toString();
        if (!this.stats.users[cleanUsername].yearlyPoints[year]) {
            this.stats.users[cleanUsername].yearlyPoints[year] = 0;
        }
    }

    async refreshUserList() {
        try {
            // Fetch updated user list from spreadsheet
            const response = await fetch(this.SPREADSHEET_URL);
            const csvText = await response.text();
            
            const users = csvText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .slice(1);

            // Initialize any new users
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

    async addMonthlyPoints(month, year, rankings) {
        // Refresh user list before adding points
        await this.refreshUserList();
        
        const pointsDistribution = { first: 3, second: 2, third: 1 };
        
        for (const [place, username] of Object.entries(rankings)) {
            await this.initializeUserIfNeeded(username);
            
            const points = pointsDistribution[place];
            this.stats.users[username].totalPoints += points;
            this.stats.users[username].yearlyPoints[year] += points;
            
            // Record achievement
            if (!this.stats.users[username].monthlyAchievements[year]) {
                this.stats.users[username].monthlyAchievements[year] = {};
            }
            this.stats.users[username].monthlyAchievements[year][month] = {
                place,
                points,
                date: new Date().toISOString()
            };
        }

        await this.saveStats();
    }

    async addBonusPoints(username, points, reason) {
        // Refresh user list to ensure user exists
        await this.refreshUserList();
        await this.initializeUserIfNeeded(username);
        
        const year = this.currentYear.toString();
        this.stats.users[username].totalPoints += points;
        this.stats.users[username].yearlyPoints[year] += points;
        
        this.stats.users[username].bonusPoints.push({
            points,
            reason,
            date: new Date().toISOString(),
            year
        });

        await this.saveStats();
    }

    async getUserStats(username) {
        // Refresh user list before getting stats
        await this.refreshUserList();
        await this.initializeUserIfNeeded(username);
        
        return {
            username,
            ...this.stats.users[username]
        };
    }

    async getYearlyLeaderboard(year = null) {
        // Refresh user list before generating leaderboard
        await this.refreshUserList();
        
        const targetYear = year || this.currentYear.toString();
        
        const leaderboard = Object.entries(this.stats.users)
            .map(([username, stats]) => ({
                username,
                points: stats.yearlyPoints[targetYear] || 0
            }))
            .sort((a, b) => b.points - a.points);

        return leaderboard;
    }

    async getAllUsers() {
        // Returns list of all tracked users
        return Object.keys(this.stats.users);
    }
}

module.exports = UserStats;

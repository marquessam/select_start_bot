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

    async archiveLeaderboard(data) {
        try {
            const date = new Date();
            const month = date.toLocaleString('default', { month: 'long' });
            const year = date.getFullYear().toString();

            if (!this.stats.monthlyStats) {
                this.stats.monthlyStats = {};
            }
            if (!this.stats.monthlyStats[year]) {
                this.stats.monthlyStats[year] = {};
            }

            this.stats.monthlyStats[year][month] = {
                archivedDate: date.toISOString(),
                gameInfo: data.gameInfo,
                leaderboard: data.leaderboard
            };

            await this.saveStats();
            
            return {
                month,
                year,
                rankings: data.leaderboard
            };
        } catch (error) {
            console.error('Error archiving leaderboard:', error);
            throw error;
        }
    }

    async loadStats() {
        try {
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
        if (!username) return;
        
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

    async addMonthlyPoints(month, year, rankings) {
        await this.refreshUserList();
        
        const pointsDistribution = { first: 6, second: 4, third: 2 };
        
        for (const [place, username] of Object.entries(rankings)) {
            if (username) {
                await this.initializeUserIfNeeded(username);
                
                const points = pointsDistribution[place];
                this.stats.users[username].totalPoints += points;
                this.stats.users[username].yearlyPoints[year] += points;
                
                if (!this.stats.users[username].monthlyAchievements[year]) {
                    this.stats.users[username].monthlyAchievements[year] = {};
                }
                this.stats.users[username].monthlyAchievements[year][month] = {
                    place,
                    points,
                    date: new Date().toISOString()
                };
            }
        }

        await this.saveStats();
    }

    async addBonusPoints(username, points, reason) {
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
        try {
            console.log('Getting stats for user:', username);
            await this.refreshUserList();
            console.log('User list refreshed');
            await this.initializeUserIfNeeded(username);
            console.log('User initialized');
            
            console.log('Current stats:', this.stats);
            console.log('User stats:', this.stats.users[username]);

            return {
                username,
                ...this.stats.users[username]
            };
        } catch (error) {
            console.error('Error in getUserStats:', error);
            throw error;
        }
    }

    async getYearlyLeaderboard(year = null) {
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
        return Object.keys(this.stats.users);
    }
}

module.exports = UserStats;

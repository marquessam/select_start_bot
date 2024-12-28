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

    // Add the archive function
    async archiveLeaderboard(data) {
        try {
            const date = new Date();
            const month = date.toLocaleString('default', { month: 'long' });
            const year = date.getFullYear().toString();

            // Initialize monthlyStats if needed
            if (!this.stats.monthlyStats) {
                this.stats.monthlyStats = {};
            }
            if (!this.stats.monthlyStats[year]) {
                this.stats.monthlyStats[year] = {};
            }

            // Store the archive
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

    // [Rest of your existing code remains exactly the same]
    async resetUserPoints(username) {
        // ... [Keep existing method]
    }

    async loadStats() {
        // ... [Keep existing method]
    }

    async saveStats() {
        // ... [Keep existing method]
    }

    async initializeUserIfNeeded(username) {
        // ... [Keep existing method]
    }

    async refreshUserList() {
        // ... [Keep existing method]
    }

    async addMonthlyPoints(month, year, rankings) {
        // ... [Keep existing method]
    }

    async addBonusPoints(username, points, reason) {
        // ... [Keep existing method]
    }

    async getUserStats(username) {
        // ... [Keep existing method]
    }

    async getYearlyLeaderboard(year = null) {
        // ... [Keep existing method]
    }

    async getAllUsers() {
        // ... [Keep existing method]
    }
}

module.exports = UserStats;

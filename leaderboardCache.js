// leaderboardCache.js
const userStats = require('./userStats');
const { fetchLeaderboardData } = require('./raAPI.js');

class LeaderboardCache {
    constructor() {
        this.yearlyLeaderboard = null;
        this.monthlyLeaderboard = null;
        this.lastUpdated = null;
    }

    async updateLeaderboards() {
        try {
            const allUsers = await userStats.getAllUsers();
            const currentYear = new Date().getFullYear().toString();

            console.log('[LEADERBOARD CACHE] Updating yearly leaderboard...');
            this.yearlyLeaderboard = await userStats.getYearlyLeaderboard(currentYear, allUsers);

            console.log('[LEADERBOARD CACHE] Updating monthly leaderboard...');
            const monthlyData = await fetchLeaderboardData();
            const monthlyParticipants = allUsers.map(participant => {
                const user = monthlyData.leaderboard.find(u => u.username.toLowerCase() === participant.toLowerCase());
                return user || { username: participant, completionPercentage: 0, completedAchievements: 0, totalAchievements: 0 };
            });
            this.monthlyLeaderboard = monthlyParticipants.sort((a, b) => b.completionPercentage - a.completionPercentage);

            this.lastUpdated = new Date();
            console.log('[LEADERBOARD CACHE] Leaderboards updated successfully.');
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating leaderboards:', error);
        }
    }

    getYearlyLeaderboard() {
        return this.yearlyLeaderboard;
    }

    getMonthlyLeaderboard() {
        return this.monthlyLeaderboard;
    }

    getLastUpdated() {
        return this.lastUpdated;
    }
}

module.exports = new LeaderboardCache();

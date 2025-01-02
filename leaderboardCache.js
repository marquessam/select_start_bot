const { fetchLeaderboardData } = require('./raAPI.js');

class LeaderboardCache {
    constructor() {
        this.validUsers = null;
        this.lastUpdated = null;
        this.userStats = null; // Placeholder for userStats instance
        this.yearlyLeaderboard = null;
        this.monthlyLeaderboard = null;
    }

    // Set the userStats instance
    setUserStats(userStatsInstance) {
        this.userStats = userStatsInstance;
    }

    // Update valid users from userStats
    async updateValidUsers() {
        if (!this.userStats) {
            console.error('[LEADERBOARD CACHE] userStats instance not set.');
            return;
        }

        try {
            console.log('[LEADERBOARD CACHE] Updating valid users...');
            this.validUsers = await this.userStats.getAllUsers();
            this.lastUpdated = new Date();
            console.log('[LEADERBOARD CACHE] Valid users updated successfully.');
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating valid users:', error);
        }
    }

    // Get valid users
    getValidUsers() {
        if (!this.validUsers) {
            console.warn('[LEADERBOARD CACHE] Valid users not yet updated.');
        }
        return this.validUsers;
    }

    // Other methods (like updateLeaderboards) remain unchanged
    async updateLeaderboards() {
        if (!this.userStats) {
            console.error('[LEADERBOARD CACHE] userStats instance not set.');
            return;
        }

        try {
            const currentYear = new Date().getFullYear().toString();
            console.log('[LEADERBOARD CACHE] Updating yearly leaderboard...');
            this.yearlyLeaderboard = await this.userStats.getYearlyLeaderboard(
                currentYear,
                this.validUsers || []
            );

            console.log('[LEADERBOARD CACHE] Updating monthly leaderboard...');
            const monthlyData = await fetchLeaderboardData();
            this.monthlyLeaderboard = this._constructMonthlyLeaderboard(
                monthlyData,
                this.validUsers || []
            );

            this.lastUpdated = new Date();
            console.log('[LEADERBOARD CACHE] Leaderboards updated successfully.');
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating leaderboards:', error);
        }
    }

    _constructMonthlyLeaderboard(monthlyData, allUsers) {
        const monthlyParticipants = allUsers.map(participant => {
            const user = monthlyData.leaderboard.find(
                u => u.username.toLowerCase() === participant.toLowerCase()
            );
            return (
                user || {
                    username: participant,
                    completionPercentage: 0,
                    completedAchievements: 0,
                    totalAchievements: 0,
                }
            );
        });

        return monthlyParticipants.sort((a, b) => b.completionPercentage - a.completionPercentage);
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

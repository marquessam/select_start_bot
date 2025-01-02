const { fetchLeaderboardData } = require('./raAPI.js');

class LeaderboardCache {
    constructor() {
        this.yearlyLeaderboard = null;
        this.monthlyLeaderboard = null;
        this.lastUpdated = null;
        this.userStats = null; // Placeholder for userStats instance
        this.validUsers = []; // Cache for valid users from the Google Sheet
    }

    // Set the userStats instance
    setUserStats(userStatsInstance) {
        this.userStats = userStatsInstance;
    }

    // Update leaderboards for both yearly and monthly rankings
    async updateLeaderboards() {
        if (!this.userStats) {
            console.error('[LEADERBOARD CACHE] userStats instance not set.');
            return;
        }

        try {
            console.log('[LEADERBOARD CACHE] Fetching valid users from the Google Sheet...');
            this.validUsers = await this.userStats.getAllUsers();

            const currentYear = new Date().getFullYear().toString();

            console.log('[LEADERBOARD CACHE] Updating yearly leaderboard...');
            this.yearlyLeaderboard = await this.userStats.getYearlyLeaderboard(currentYear, this.validUsers);

            console.log('[LEADERBOARD CACHE] Updating monthly leaderboard...');
            const monthlyData = await fetchLeaderboardData();
            this.monthlyLeaderboard = this._constructMonthlyLeaderboard(monthlyData);

            this.lastUpdated = new Date();
            console.log('[LEADERBOARD CACHE] Leaderboards updated successfully at', this.lastUpdated);
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating leaderboards:', error);
        }
    }

    // Get the yearly leaderboard
    getYearlyLeaderboard() {
        if (!this.yearlyLeaderboard) {
            console.warn('[LEADERBOARD CACHE] Yearly leaderboard not yet updated.');
        }
        return this.yearlyLeaderboard;
    }

    // Get the monthly leaderboard
    getMonthlyLeaderboard() {
        if (!this.monthlyLeaderboard) {
            console.warn('[LEADERBOARD CACHE] Monthly leaderboard not yet updated.');
        }
        return this.monthlyLeaderboard;
    }

    // Get the valid users
    getValidUsers() {
        if (!this.validUsers || this.validUsers.length === 0) {
            console.warn('[LEADERBOARD CACHE] Valid users not yet fetched.');
        }
        return this.validUsers;
    }

    // Get the timestamp of the last update
    getLastUpdated() {
        return this.lastUpdated;
    }

    // Construct the monthly leaderboard
    _constructMonthlyLeaderboard(monthlyData) {
        const monthlyParticipants = this.validUsers.map(participant => {
            const user = monthlyData.leaderboard.find(
                u => u.username.toLowerCase() === participant.toLowerCase()
            );
            return user || {
                username: participant,
                completionPercentage: 0,
                completedAchievements: 0,
                totalAchievements: 0
            };
        });

        return monthlyParticipants.sort((a, b) => b.completionPercentage - a.completionPercentage);
    }
}

module.exports = new LeaderboardCache();

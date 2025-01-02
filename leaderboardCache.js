const { fetchLeaderboardData } = require('./raAPI.js');

class LeaderboardCache {
    constructor() {
        this.yearlyLeaderboard = null;
        this.monthlyLeaderboard = null;
        this.lastUpdated = null;
        this.userStats = null; // Placeholder for userStats instance
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
            const validUsers = await this.userStats.getAllUsers();
            const currentYear = new Date().getFullYear().toString();

            console.log('[LEADERBOARD CACHE] Updating yearly leaderboard...');
            this.yearlyLeaderboard = await this.userStats.getYearlyLeaderboard(currentYear, validUsers);

            // Filter out invalid users from the yearly leaderboard
            this.yearlyLeaderboard = this.yearlyLeaderboard.filter(user =>
                validUsers.includes(user.username.toLowerCase())
            );

            console.log('[LEADERBOARD CACHE] Updating monthly leaderboard...');
            const monthlyData = await fetchLeaderboardData();
            this.monthlyLeaderboard = this._constructMonthlyLeaderboard(monthlyData, validUsers);

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

    // Get the timestamp of the last update
    getLastUpdated() {
        return this.lastUpdated;
    }

    // Construct the monthly leaderboard
    _constructMonthlyLeaderboard(monthlyData, validUsers) {
        const monthlyParticipants = validUsers.map(participant => {
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

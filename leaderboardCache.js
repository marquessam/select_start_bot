const { fetchLeaderboardData } = require('./raAPI.js');

class LeaderboardCache {
    constructor() {
        this.validUsers = null;
        this.lastUpdated = null;
        this.userStats = null;
        this.yearlyLeaderboard = null;
        this.monthlyLeaderboard = null;
    }

    setUserStats(userStatsInstance) {
        this.userStats = userStatsInstance;
    }

    async updateValidUsers() {
        try {
            console.log('[LEADERBOARD CACHE] Updating valid users...');
            if (!this.userStats) {
                console.error('[LEADERBOARD CACHE] userStats instance not set.');
                this.validUsers = [];
                return;
            }
            this.validUsers = await this.userStats.getAllUsers();
            this.lastUpdated = new Date();
            console.log('[LEADERBOARD CACHE] Valid users updated:', this.validUsers);
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating valid users:', error);
            this.validUsers = [];
        }
    }

    isValidUser(username) {
        if (!this.validUsers) {
            console.warn('[LEADERBOARD CACHE] Valid users not yet initialized');
            return false;
        }
        return this.validUsers.includes(username.toLowerCase());
    }

   async updateLeaderboards() {
    if (!this.userStats) {
        console.error('[LEADERBOARD CACHE] userStats instance not set.');
        return;
    }

    try {
        const currentYear = new Date().getFullYear().toString();
        console.log('[LEADERBOARD CACHE] Updating yearly leaderboard...');

        // Ensure we have valid users
        if (!this.validUsers || this.validUsers.length === 0) {
            await this.updateValidUsers();
        }

        // Get yearly leaderboard
        this.yearlyLeaderboard = await this.userStats.getYearlyLeaderboard(
            currentYear,
            this.validUsers || []
        );

        // Get monthly leaderboard and update participation
        console.log('[LEADERBOARD CACHE] Updating monthly leaderboard...');
        try {
            const monthlyData = await fetchLeaderboardData();
            this.monthlyLeaderboard = this._constructMonthlyLeaderboard(
                monthlyData,
                this.validUsers || []
            );

            // Update participation tracking
            await this.userStats.updateMonthlyParticipation(monthlyData);
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error fetching monthly data:', error);
            this.monthlyLeaderboard = [];
        }

        this.lastUpdated = new Date();
        console.log('[LEADERBOARD CACHE] Leaderboards updated successfully.');
    } catch (error) {
        console.error('[LEADERBOARD CACHE] Error updating leaderboards:', error);
        this.yearlyLeaderboard = [];
        this.monthlyLeaderboard = [];
    }
}

    _constructMonthlyLeaderboard(monthlyData, allUsers) {
        try {
            if (!monthlyData?.leaderboard) {
                console.warn('[LEADERBOARD CACHE] No monthly data available');
                return [];
            }

            // Only include valid users in the leaderboard
            const validParticipants = allUsers.filter(user => this.isValidUser(user));

            const monthlyParticipants = validParticipants.map(participant => {
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
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error constructing monthly leaderboard:', error);
            return [];
        }
    }

    getYearlyLeaderboard() {
        if (!this.yearlyLeaderboard) {
            console.warn('[LEADERBOARD CACHE] Yearly leaderboard not initialized');
            return [];
        }
        return this.yearlyLeaderboard;
    }

    getMonthlyLeaderboard() {
        if (!this.monthlyLeaderboard) {
            console.warn('[LEADERBOARD CACHE] Monthly leaderboard not initialized');
            return [];
        }
        return this.monthlyLeaderboard;
    }

    getValidUsers() {
        if (!this.validUsers) {
            console.warn('[LEADERBOARD CACHE] Valid users not yet updated');
            return [];
        }
        return this.validUsers;
    }

    getLastUpdated() {
        return this.lastUpdated;
    }
}

module.exports = new LeaderboardCache();

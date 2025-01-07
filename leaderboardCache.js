const { fetchLeaderboardData } = require('./raAPI.js');

class LeaderboardCache {
    constructor(database) {
        this.database = database;
        this.userStats = null;
        this.cache = {
            validUsers: new Set(),
            yearlyLeaderboard: null,
            monthlyLeaderboard: null,
            lastUpdated: null,
            updateInterval: 15 * 60 * 1000, // 15 minutes
            retryDelay: 5 * 60 * 1000      // 5 minutes
        };
    }

    setUserStats(userStatsInstance) {
        this.userStats = userStatsInstance;
    }

    shouldUpdate() {
        return !this.cache.lastUpdated || 
               (Date.now() - this.cache.lastUpdated) > this.cache.updateInterval;
    }

    async updateValidUsers() {
        try {
            if (!this.userStats) {
                console.error('[LEADERBOARD CACHE] UserStats instance not set');
                return false;
            }

            const users = await this.database.getValidUsers();
            this.cache.validUsers = new Set(users.map(u => u.toLowerCase()));

            // Initialize stats for new users
            for (const username of users) {
                await this.userStats.initializeUserIfNeeded(username);
            }

            return true;
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating valid users:', error);
            return false;
        }
    }

    isValidUser(username) {
        return this.cache.validUsers.has(username.toLowerCase());
    }

    async updateLeaderboards(force = false) {
        if (!force && !this.shouldUpdate()) {
            return;
        }

        try {
            if (!this.userStats) {
                throw new Error('UserStats instance not set');
            }

            // Ensure we have valid users
            if (this.cache.validUsers.size === 0) {
                await this.updateValidUsers();
            }

            const currentYear = new Date().getFullYear().toString();

            // Update yearly leaderboard
            this.cache.yearlyLeaderboard = await this.userStats.getYearlyLeaderboard(
                currentYear,
                Array.from(this.cache.validUsers)
            );

            // Update monthly leaderboard
            try {
                const monthlyData = await fetchLeaderboardData();
                this.cache.monthlyLeaderboard = this._constructMonthlyLeaderboard(monthlyData);
                await this.userStats.updateMonthlyParticipation(monthlyData);
            } catch (error) {
                console.error('[LEADERBOARD CACHE] Error fetching monthly data:', error);
                // Keep existing monthly data if fetch fails
                if (!this.cache.monthlyLeaderboard) {
                    this.cache.monthlyLeaderboard = [];
                }
                // Schedule retry
                setTimeout(() => this.updateLeaderboards(true), this.cache.retryDelay);
            }

            this.cache.lastUpdated = Date.now();
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating leaderboards:', error);
            this.cache.yearlyLeaderboard = [];
            this.cache.monthlyLeaderboard = [];
            // Schedule retry
            setTimeout(() => this.updateLeaderboards(true), this.cache.retryDelay);
        }
    }

    _constructMonthlyLeaderboard(monthlyData) {
        try {
            if (!monthlyData?.leaderboard) {
                console.warn('[LEADERBOARD CACHE] No monthly data available');
                return [];
            }

            const validParticipants = Array.from(this.cache.validUsers);

            const monthlyParticipants = validParticipants.map(participant => {
                const user = monthlyData.leaderboard.find(
                    u => u.username.toLowerCase() === participant.toLowerCase()
                );
                
                return user || {
                    username: participant,
                    completionPercentage: 0,
                    completedAchievements: 0,
                    totalAchievements: 0,
                    hasCompletion: false
                };
            });

            return monthlyParticipants.sort((a, b) => {
                const percentageDiff = b.completionPercentage - a.completionPercentage;
                return percentageDiff !== 0 ? 
                       percentageDiff : 
                       b.completedAchievements - a.completedAchievements;
            });
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error constructing monthly leaderboard:', error);
            return [];
        }
    }

    getYearlyLeaderboard() {
        if (!this.cache.yearlyLeaderboard) {
            console.warn('[LEADERBOARD CACHE] Yearly leaderboard not initialized');
            return [];
        }
        return this.cache.yearlyLeaderboard;
    }

    getMonthlyLeaderboard() {
        if (!this.cache.monthlyLeaderboard) {
            console.warn('[LEADERBOARD CACHE] Monthly leaderboard not initialized');
            return [];
        }
        return this.cache.monthlyLeaderboard;
    }

    async refreshLeaderboard() {
        await this.updateLeaderboards(true);
    }

    getLastUpdated() {
        return this.cache.lastUpdated;
    }
}

// Export a factory function
module.exports = function createLeaderboardCache(database) {
    return new LeaderboardCache(database);
};

const database = require('../database');
const leaderboardCache = require('../leaderboardCache');
const raAPI = require('../raAPI');

class DataService {
    static async getUserStats(username) {
        const stats = await database.getUserStats();
        const userStats = stats.users[username.toLowerCase()] || {
            yearlyPoints: 0,
            gamesCompleted: 0,
            achievementsUnlocked: 0,
            monthlyParticipations: 0,
            bonusPoints: 0,
        };

        return userStats;
    }

    static async getLeaderboard(type = 'monthly') {
        if (type === 'monthly') {
            return leaderboardCache.getMonthlyLeaderboard();
        } else if (type === 'yearly') {
            return leaderboardCache.getYearlyLeaderboard();
        }
        throw new Error('Invalid leaderboard type');
    }

    static async getCurrentChallenge() {
        return await database.getCurrentChallenge();
    }
     static async getHighScores() {
        return await database.getHighScores();
    }

    static async getUserProgress(username) {
        const leaderboard = await this.getLeaderboard('monthly');
        const user = leaderboard.find(
            user => user.username.toLowerCase() === username.toLowerCase()
        );

        return user || {
            completionPercentage: 0,
            completedAchievements: 0,
            totalAchievements: 0,
        };
    }
static async refreshUserList() {
    try {
        await leaderboardCache.updateLeaderboards(); // Ensure this refreshes the cache
        console.log('User list refreshed successfully.');
    } catch (error) {
        console.error('Error refreshing user list:', error);
    }
}

   static async getRAProfileImage(username) {
    try {
        const profile = await raAPI.fetchUserProfile(username); // Correct method name
        return profile?.profileImage || null; // Use the profileImage field
    } catch (error) {
        console.error('Error fetching RA profile image:', error);
        return null; // Return null if there's an error
    }
}

}

module.exports = DataService;

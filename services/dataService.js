const database = require('../database');
const leaderboardCache = require('../leaderboardCache');

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
}

module.exports = DataService;

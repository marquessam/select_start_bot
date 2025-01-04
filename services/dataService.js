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

    static async getValidUsers() {
        return await database.getValidUsers();
    }

    static async isValidUser(username) {
        const validUsers = await this.getValidUsers();
        return validUsers.includes(username.toLowerCase());
    }

    static async getLeaderboard(type = 'monthly') {
        if (type === 'monthly') {
            return leaderboardCache.getMonthlyLeaderboard();
        } else if (type === 'yearly') {
            const validUsers = await this.getValidUsers();
            return leaderboardCache.getYearlyLeaderboard(null, validUsers);
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
        // First check if user is valid
        if (!await this.isValidUser(username)) {
            return {
                completionPercentage: 0,
                completedAchievements: 0,
                totalAchievements: 0,
            };
        }

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
            await leaderboardCache.updateLeaderboards();
            // Get fresh list of valid users from database
            const validUsers = await this.getValidUsers();
            console.log(`User list refreshed successfully. ${validUsers.length} valid users found.`);
        } catch (error) {
            console.error('Error refreshing user list:', error);
        }
    }

    static async getRAProfileImage(username) {
        try {
            // Only fetch profile image for valid users
            if (!await this.isValidUser(username)) {
                return null;
            }

            const profile = await raAPI.fetchUserProfile(username);
            return profile?.profileImage || null;
        } catch (error) {
            console.error('Error fetching RA profile image:', error);
            return null;
        }
    }

    // Helper method for commands that need to validate users
    static async validateAndGetUser(username) {
        const isValid = await this.isValidUser(username);
        if (!isValid) {
            return {
                isValid: false,
                error: `User "${username}" is not a registered participant. Users must post their RetroAchievements profile URL in #retroachievements`
            };
        }

        return {
            isValid: true,
            userStats: await this.getUserStats(username),
            userProgress: await this.getUserProgress(username)
        };
    }
}

module.exports = DataService;

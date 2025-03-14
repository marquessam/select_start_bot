// dataService.js
const database = require('../database');
const raAPI = require('../raAPI');

class DataService {
    static async getUserStats(username) {
        const stats = await database.getUserStats();
        // Fall back to a default object if user isn't found
        return stats.users[username.toLowerCase()] || {
            yearlyPoints: 0,
            gamesBeaten: 0,
            achievementsUnlocked: 0,
            monthlyParticipations: 0,
            bonusPoints: 0
        };
    }

    static async getValidUsers() {
        return database.getValidUsers();
    }

    static async isValidUser(username) {
        const validUsers = await this.getValidUsers();
        return validUsers.includes(username.toLowerCase());
    }

    static async getLeaderboard(type = 'monthly') {
        if (!global.leaderboardCache) {
            console.warn('[DATA SERVICE] LeaderboardCache not initialized');
            return [];
        }

        try {
            if (type === 'monthly') {
                return global.leaderboardCache.getMonthlyLeaderboard() || [];
            } else if (type === 'yearly') {
                const validUsers = await this.getValidUsers();
                return (
                    global.leaderboardCache.getYearlyLeaderboard(null, validUsers) || []
                );
            }
            throw new Error(`Invalid leaderboard type: "${type}"`);
        } catch (error) {
            console.error('[DATA SERVICE] Error getting leaderboard:', error);
            return [];
        }
    }

    static async refreshLeaderboardCache() {
        if (!global.leaderboardCache) {
            console.warn('[DATA SERVICE] LeaderboardCache not initialized, cannot refresh');
            return [];
        }

        try {
            console.log('[DATA SERVICE] Forcing leaderboard cache refresh');
            // Force a refresh of the leaderboard data
            await global.leaderboardCache.refreshLeaderboard();
            return global.leaderboardCache.getMonthlyLeaderboard() || [];
        } catch (error) {
            console.error('[DATA SERVICE] Error refreshing leaderboard cache:', error);
            return [];
        }
    }

    static async getCurrentChallenge() {
        return database.getCurrentChallenge();
    }

    static async saveCurrentChallenge(challengeData) {
        return database.saveCurrentChallenge(challengeData);
    }

    static async saveShadowGame(shadowGameData) {
        return database.saveShadowGame(shadowGameData);
    }

    static async getShadowGame() {
        return database.getShadowGame();
    }

    static async getArcadeScores() {
        return database.getArcadeScores();
    }

    static async getUserProgress(username) {
        try {
            // Check if user is valid first
            if (!(await this.isValidUser(username))) {
                return {
                    completionPercentage: 0,
                    completedAchievements: 0,
                    totalAchievements: 0,
                    hasBeatenGame: false
                };
            }

            // Attempt to find user in monthly leaderboard
            const leaderboard = await this.getLeaderboard('monthly');
            const userEntry = leaderboard.find(
                u => u.username.toLowerCase() === username.toLowerCase()
            );

            // If not found, return default progress
            return (
                userEntry || {
                    completionPercentage: 0,
                    completedAchievements: 0,
                    totalAchievements: 0,
                    hasBeatenGame: false
                }
            );
        } catch (error) {
            console.error('[DATA SERVICE] Error getting user progress:', error);
            return {
                completionPercentage: 0,
                completedAchievements: 0,
                totalAchievements: 0,
                hasBeatenGame: false
            };
        }
    }

    static async refreshUserList() {
        try {
            if (!global.leaderboardCache) {
                console.warn('[DATA SERVICE] LeaderboardCache not initialized');
                return;
            }

            await global.leaderboardCache.updateValidUsers();
            await global.leaderboardCache.updateLeaderboards();

            // Get fresh list of valid users from database
            const validUsers = await this.getValidUsers();
            console.log(
                `User list refreshed successfully. ${validUsers.length} valid users found.`
            );
        } catch (error) {
            console.error('[DATA SERVICE] Error refreshing user list:', error);
        }
    }

    static async getRAProfileImage(username) {
        try {
            // Only fetch profile image for valid users
            if (!(await this.isValidUser(username))) {
                return null;
            }
            const profile = await raAPI.fetchUserProfile(username);
            return profile?.profileImage || null;
        } catch (error) {
            console.error('[DATA SERVICE] Error fetching RA profile image:', error);
            return null;
        }
    }

    static async validateAndGetUser(username) {
        try {
            const isValid = await this.isValidUser(username);
            if (!isValid) {
                return {
                    isValid: false,
                    error: `User "${username}" is not a registered participant. ` +
                        'Users must post their RetroAchievements profile URL in #retroachievements'
                };
            }

            // Build user info
            const [userStats, userProgress] = await Promise.all([
                this.getUserStats(username),
                this.getUserProgress(username)
            ]);

            return {
                isValid: true,
                userStats,
                userProgress
            };
        } catch (error) {
            console.error('[DATA SERVICE] Error validating user:', error);
            return {
                isValid: false,
                error: 'An error occurred while validating the user'
            };
        }
    }
}

module.exports = DataService;

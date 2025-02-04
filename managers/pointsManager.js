// pointsManager.js
const { withTransaction } = require('../utils/transactions');
const PointsSystem = require('../PointsSystem');

class PointsManager {
    constructor(database) {
        this.database = database;
        this.pointsSystem = new PointsSystem(database);
    }

    async processNewAchievements(username, achievements) {
        try {
            const points = await this.pointsSystem.processAchievements(username, achievements);
            
            for (const point of points) {
                await this.awardPoints(username, point.points, point.reason);
            }

            return points;
        } catch (error) {
            console.error(`[POINTS] Error processing achievements for ${username}:`, error);
            return [];
        }
    }

    async awardPoints(username, points, reason) {
        try {
            const cleanUsername = username.toLowerCase().trim();
            const year = new Date().getFullYear().toString();
            const technicalKey = reason.key || `${reason}-${Date.now()}`;

            const pointRecord = {
                points,
                reason: reason.display || reason,
                internalReason: reason.internal || reason,
                technicalKey,
                year,
                date: new Date().toISOString()
            };

            const success = await withTransaction(this.database, async (session) => {
                return await this.database.addUserBonusPoints(cleanUsername, pointRecord);
            });

            if (success) {
                // Announce points if achievement feed exists
                if (global.achievementFeed) {
                    await global.achievementFeed.announcePointsAward(
                        username, 
                        points, 
                        pointRecord.reason
                    );
                }
            }

            return success;
        } catch (error) {
            console.error(`[POINTS] Error awarding points to ${username}:`, error);
            return false;
        }
    }

    async getUserPoints(username, year = null) {
        try {
            const targetYear = year || new Date().getFullYear().toString();
            const cleanUsername = username.toLowerCase().trim();
            
            const points = await this.database.getUserBonusPoints(cleanUsername);
            return points.filter(point => point.year === targetYear);
        } catch (error) {
            console.error('[POINTS] Error getting user points:', error);
            return [];
        }
    }

    async cleanupDuplicatePoints() {
        return this.database.cleanupDuplicatePoints();
    }
}

module.exports = PointsManager;

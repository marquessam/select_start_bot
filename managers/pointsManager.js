// managers/pointsManager.js

const { withTransaction } = require('../utils/transactions');
const ErrorHandler = require('../utils/errorHandler');

class PointsManager {
    constructor(database) {
        this.database = database;
        
        // Cache configuration
        this.cache = {
            pendingUpdates: new Set(),
            lastUpdate: null,
            updateInterval: 5 * 60 * 1000 // 5 minutes
        };
        
        // Points configuration for monthly challenges
        this.pointTypes = {
            participation: { value: 1, key: 'participation' },
            beaten: { value: 3, key: 'beaten' },
            mastery: { value: 3, key: 'mastery' }
        };

        // Game configurations
        this.gameConfig = {
            "319": {  // Chrono Trigger
                name: "Chrono Trigger",
                masteryCheck: true,
                masteryOnly: true
            },
            "355": {  // ALTTP
                name: "The Legend of Zelda: A Link to the Past",
                progression: [944, 2192, 2282, 980, 2288, 2291, 2292, 2296, 2315, 2336, 2351, 
                            2357, 2359, 2361, 2365, 2334, 2354, 2368, 2350, 2372, 2387],
                winCondition: [2389],
                requireProgression: true,
                requireAllWinConditions: true,
                masteryCheck: true
            }
        };

        // Track operations
        this._activeOperations = new Map();
    }

    async getUserPoints(username, year = null) {
        try {
            const targetYear = year || new Date().getFullYear().toString();
            const cleanUsername = username.toLowerCase().trim();
            
            const bonusPoints = await this.database.getUserBonusPoints(cleanUsername);
            
            // Use Map to ensure uniqueness by technicalKey
            const uniquePoints = new Map();
            
            bonusPoints
                .filter(point => point.year === targetYear)
                .forEach(point => {
                    const key = point.technicalKey || point.internalReason;
                    // Only keep the newest point for each unique key
                    if (!uniquePoints.has(key) || 
                        new Date(point.date) > new Date(uniquePoints.get(key).date)) {
                        uniquePoints.set(key, point);
                    }
                });

            return Array.from(uniquePoints.values())
                .sort((a, b) => new Date(b.date) - new Date(a.date));
        } catch (error) {
            console.error('[POINTS] Error getting user points:', error);
            return [];
        }
    }

    async awardPoints(username, points, reason, gameId = null) {
        const operationId = `points-${username}-${Date.now()}`;
        this._activeOperations.set(operationId, true);

        try {
            const cleanUsername = username.toLowerCase().trim();
            const year = new Date().getFullYear().toString();
            const technicalKey = gameId ? `${reason.key || 'bonus'}-${gameId}` : reason.key || reason;

            // Check if this point type already exists for this year
            const existingPoints = await this.getUserPoints(cleanUsername, year);
            const hasExistingPoints = existingPoints.some(p => p.technicalKey === technicalKey);

            if (hasExistingPoints) {
                console.log(`[POINTS] Points of type ${technicalKey} already awarded to ${username} for ${year}`);
                return false;
            }

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
                this.cache.pendingUpdates.add(cleanUsername);
                console.log(`[POINTS] Successfully awarded points to ${username}`);

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
        } finally {
            this._activeOperations.delete(operationId);
        }
    }

    async cleanupDuplicatePoints() {
        try {
            console.log('[POINTS] Starting duplicate points cleanup...');
            const collection = await this.database.getCollection('bonusPoints');
            
            const allPoints = await collection.find({}).toArray();
            
            const pointGroups = allPoints.reduce((groups, point) => {
                const key = `${point.username}-${point.year}-${point.technicalKey}`;
                if (!groups[key]) {
                    groups[key] = [];
                }
                groups[key].push(point);
                return groups;
            }, {});

            let removedCount = 0;

            for (const points of Object.values(pointGroups)) {
                if (points.length > 1) {
                    points.sort((a, b) => new Date(b.date) - new Date(a.date));
                    
                    const toRemove = points.slice(1);
                    const result = await collection.deleteMany({
                        _id: { $in: toRemove.map(p => p._id) }
                    });
                    
                    removedCount += result.deletedCount;
                    console.log(`[POINTS] Removed ${result.deletedCount} duplicate points for ${points[0].username} - ${points[0].technicalKey}`);
                }
            }

            console.log(`[POINTS] Cleanup complete. Removed ${removedCount} duplicate points.`);
            
            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

            return removedCount;
        } catch (error) {
            console.error('[POINTS] Error cleaning up duplicate points:', error);
            throw error;
        }
    }

    createPointReason(gameName, achievementType, technicalKey) {
        return {
            display: `${gameName} - ${achievementType}`,
            internal: `${gameName} - ${achievementType} (${technicalKey})`,
            key: technicalKey
        };
    }

    async checkGamePoints(username, achievements, gameId) {
        try {
            if (!this.gameConfig[gameId]) {
                return [];
            }

            const points = [];
            const gameConfig = this.gameConfig[gameId];
            const year = new Date().getFullYear().toString();

            // Check participation (only if not a mastery-only game)
            if (!gameConfig.masteryOnly) {
                if (achievements.some(a => parseInt(a.DateEarned) > 0)) {
                    points.push({
                        type: 'participation',
                        points: this.pointTypes.participation.value,
                        reason: this.createPointReason(
                            achievements[0].GameTitle || gameConfig.name,
                            'Participation',
                            `participation-${gameId}`
                        )
                    });
                }
            }

            // Check game beaten
            if (!gameConfig.masteryOnly && await this.checkGameBeaten(achievements, gameConfig)) {
                points.push({
                    type: 'beaten',
                    points: this.pointTypes.beaten.value,
                    reason: this.createPointReason(
                        achievements[0].GameTitle || gameConfig.name,
                        'Game Beaten',
                        `beaten-${gameId}`
                    )
                });
            }

            // Check mastery
            if (gameConfig.masteryCheck && await this.checkGameMastery(achievements)) {
                points.push({
                    type: 'mastery',
                    points: this.pointTypes.mastery.value,
                    reason: this.createPointReason(
                        achievements[0].GameTitle || gameConfig.name,
                        'Mastery',
                        `mastery-${gameId}`
                    )
                });
            }

            return points;
        } catch (error) {
            console.error('[POINTS] Error checking game points:', error);
            return [];
        }
    }

    async checkGameBeaten(achievements, gameConfig) {
        try {
            if (!gameConfig.winCondition) return false;

            let hasBeaten = true;

            if (gameConfig.requireProgression && gameConfig.progression) {
                hasBeaten = gameConfig.progression.every(achId =>
                    achievements.some(a => 
                        parseInt(a.ID) === achId && 
                        parseInt(a.DateEarned) > 0
                    )
                );
            }

            if (hasBeaten) {
                if (gameConfig.requireAllWinConditions) {
                    hasBeaten = gameConfig.winCondition.every(achId =>
                        achievements.some(a => 
                            parseInt(a.ID) === achId && 
                            parseInt(a.DateEarned) > 0
                        )
                    );
                } else {
                    hasBeaten = gameConfig.winCondition.some(achId =>
                        achievements.some(a => 
                            parseInt(a.ID) === achId && 
                            parseInt(a.DateEarned) > 0
                        )
                    );
                }
            }

            return hasBeaten;
        } catch (error) {
            console.error('[POINTS] Error checking game beaten:', error);
            return false;
        }
    }

    async checkGameMastery(achievements) {
        try {
            const totalAchievements = achievements.length;
            const earnedAchievements = achievements.filter(a => 
                parseInt(a.DateEarned) > 0
            ).length;

            return totalAchievements > 0 && totalAchievements === earnedAchievements;
        } catch (error) {
            console.error('[POINTS] Error checking game mastery:', error);
            return false;
        }
    }
}

module.exports = PointsManager;

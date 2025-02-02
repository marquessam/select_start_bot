const { withTransaction } = require('../utils/transactions');
const ErrorHandler = require('../utils/errorHandler');

class PointsManager {
    constructor(database) {
        this.database = database;
        this.services = null;
        
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

        // For controlling concurrency
        this._activeOperations = new Map();
    }

    setServices(services) {
        this.services = services;
        console.log('[POINTS MANAGER] Services updated');
    }

   async getUserPoints(username, year = null) {
    try {
        const targetYear = year || new Date().getFullYear().toString();
        const cleanUsername = username.toLowerCase().trim();
        
        const bonusPoints = await this.database.getUserBonusPoints(cleanUsername);
        
        // Use Map to ensure uniqueness by technicalKey AND gameId
        const uniquePoints = new Map();
        
        bonusPoints
            .filter(point => point.year === targetYear)
            .forEach(point => {
                const key = point.technicalKey || point.internalReason;
                // Only keep the newest point for each unique key and gameId combination
                const mapKey = `${key}-${point.gameId || 'nogame'}`;
                if (!uniquePoints.has(mapKey) || 
                    new Date(point.date) > new Date(uniquePoints.get(mapKey).date)) {
                    uniquePoints.set(mapKey, point);
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

        // Construct technicalKey consistently
        const technicalKey = gameId ? `${reason.key || reason}-${gameId}` : reason.key || reason;

        console.log(`[POINTS] Awarding points to ${username} with technicalKey: ${technicalKey}`);

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
            console.log(`[POINTS] Successfully awarded points to ${username}`);

            // Announce points if achievement feed exists
            if (this.services?.achievementFeed) {
                await this.services.achievementFeed.announcePointsAward(
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

async recheckHistoricalPoints(username, achievements, gameId) {
    try {
        const gameConfig = this.gameConfig[gameId];
        if (!gameConfig) return [];

        const year = new Date().getFullYear().toString();
        const points = [];
        const gameAchievements = achievements.filter(a => String(a.GameID) === String(gameId));

        // Check mastery (available all year)
        if (gameConfig.points?.mastery && gameConfig.masteryCheck) {
            const hasMastery = await this.checkGameMastery(gameAchievements);
            if (hasMastery) {
                points.push({
                    type: 'mastery',
                    points: gameConfig.points.mastery,
                    reason: {
                        display: `${gameConfig.name} - Mastery`,
                        internal: `${gameConfig.name} - Mastery (mastery-${gameId})`,
                        key: `mastery-${gameId}` // Ensure key is set
                    }
                });
            }
        }

        // Check monthly-only points if in correct month or historical
        if (gameConfig.points) {
            // Check participation
            if (gameConfig.points.participation) {
                const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
                if (hasParticipation) {
                    points.push({
                        type: 'participation',
                        points: gameConfig.points.participation,
                        reason: {
                            display: `${gameConfig.name} - Participation`,
                            internal: `${gameConfig.name} - Participation (participation-${gameId})`,
                            key: `participation-${gameId}` // Ensure key is set
                        }
                    });
                }
            }

            // Check beaten
            if (gameConfig.points.beaten) {
                const hasBeaten = await this.checkGameBeaten(gameAchievements, gameConfig);
                if (hasBeaten) {
                    points.push({
                        type: 'beaten',
                        points: gameConfig.points.beaten,
                        reason: {
                            display: `${gameConfig.name} - Game Beaten`,
                            internal: `${gameConfig.name} - Game Beaten (beaten-${gameId})`,
                            key: `beaten-${gameId}` // Ensure key is set
                        }
                    });
                }
            }
        }

        // Award any missing points
        for (const point of points) {
            const existingPoints = await this.getUserPoints(username, year);
            const hasExistingPoints = existingPoints.some(p => 
                p.technicalKey === point.reason.key
            );

            if (!hasExistingPoints) {
                await this.awardPoints(
                    username,
                    point.points,
                    point.reason,
                    gameId
                );
            }
        }

        return points;
    } catch (error) {
        console.error('[POINTS] Error checking historical points:', error);
        return [];
    }
}

    async cleanupDuplicatePoints() {
        try {
            console.log('[POINTS] Starting duplicate points cleanup...');
            const collection = await this.database.getCollection('bonusPoints');
            const year = new Date().getFullYear().toString();
            
            const duplicates = await collection.aggregate([
                { $match: { year } },
                {
                    $group: {
                        _id: {
                            username: '$username',
                            internalReason: '$internalReason'
                        },
                        count: { $sum: 1 },
                        docs: { $push: '$_id' }
                    }
                },
                { $match: { count: { $gt: 1 } } }
            ]).toArray();

            let removedCount = 0;
            for (const dup of duplicates) {
                const docsToRemove = dup.docs.slice(1);
                await collection.deleteMany({
                    _id: { $in: docsToRemove }
                });
                removedCount += docsToRemove.length;
            }

            console.log(`[POINTS] Removed ${removedCount} duplicate point records`);
            return removedCount;
        } catch (error) {
            console.error('[POINTS] Error cleaning up duplicate points:', error);
            throw error;
        }
    }
}

module.exports = PointsManager;

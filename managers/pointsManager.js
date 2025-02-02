const { withTransaction } = require('../utils/transactions');
const ErrorHandler = require('../utils/errorHandler');
const { pointsConfig } = require('../pointsConfig');

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
            
            // Use Map to ensure uniqueness by type, game, and action
            const uniquePoints = new Map();
            
            bonusPoints
                .filter(point => point.year === targetYear)
                .forEach(point => {
                    // Create a unique key that combines type, game, and action
                    const pointType = point.pointType || point.reason.toLowerCase().split(' - ')[1];
                    const key = `${pointType}-${point.gameId || 'nogame'}`;
                    
                    // Only keep the newest point for each unique combination
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
            
            // Extract point type from reason
            const pointType = reason.type || reason.toLowerCase().split(' - ')[1];
            
            // Create standardized technical key
            const technicalKey = gameId ? 
                `${pointType}-${gameId}` : 
                `${pointType}-nogame`;

            console.log(`[POINTS] Checking ${username} for ${technicalKey}`);

            // Check for existing points
            const existingPoints = await this.getUserPoints(cleanUsername, year);
            const hasExistingPoints = existingPoints.some(p => 
                p.technicalKey === technicalKey || 
                (p.gameId === gameId && p.pointType === pointType)
            );

            if (hasExistingPoints) {
                console.log(`[POINTS] ${username} already has ${pointType} points for game ${gameId || 'none'}`);
                return false;
            }

            const pointRecord = {
                points,
                reason: reason.display || reason,
                internalReason: reason.internal || `${reason} (${technicalKey})`,
                technicalKey,
                pointType,
                gameId,
                year,
                date: new Date().toISOString()
            };

            const success = await withTransaction(this.database, async (session) => {
                return await this.database.addUserBonusPoints(cleanUsername, pointRecord);
            });

            if (success) {
                console.log(`[POINTS] Awarded ${points} ${pointType} points to ${username}`);

                // Announce points if feed is not paused
                if (this.services?.achievementFeed && !this.services.achievementFeed.isPaused) {
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
            const gameConfig = pointsConfig.monthlyGames[gameId];
            if (!gameConfig) return [];

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
                            internal: `${gameConfig.name} - Mastery`,
                            type: 'mastery'
                        }
                    });
                }
            }

            // Check participation and beaten
            if (gameConfig.points) {
                const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
                if (hasParticipation && gameConfig.points.participation) {
                    points.push({
                        type: 'participation',
                        points: gameConfig.points.participation,
                        reason: {
                            display: `${gameConfig.name} - Participation`,
                            internal: `${gameConfig.name} - Participation`,
                            type: 'participation'
                        }
                    });
                }

                if (gameConfig.points.beaten && await this.checkGameBeaten(gameAchievements, gameConfig)) {
                    points.push({
                        type: 'beaten',
                        points: gameConfig.points.beaten,
                        reason: {
                            display: `${gameConfig.name} - Game Beaten`,
                            internal: `${gameConfig.name} - Game Beaten`,
                            type: 'beaten'
                        }
                    });
                }
            }

            // Award any missing points
            for (const point of points) {
                await this.awardPoints(username, point.points, point.reason, gameId);
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
            
            // Get all points for the year
            const allPoints = await collection.find({ year }).toArray();
            
            // Group by username, game, and point type
            const groupedPoints = new Map();
            
            allPoints.forEach(point => {
                const pointType = point.pointType || point.reason.toLowerCase().split(' - ')[1];
                const key = `${point.username}-${point.gameId || 'nogame'}-${pointType}`;
                
                if (!groupedPoints.has(key)) {
                    groupedPoints.set(key, []);
                }
                groupedPoints.get(key).push(point);
            });

            // Find and remove duplicates
            let removedCount = 0;
            const processedUsers = new Set();

            for (const [key, points] of groupedPoints.entries()) {
                if (points.length > 1) {
                    // Sort by date, keep newest
                    points.sort((a, b) => new Date(b.date) - new Date(a.date));
                    
                    // Remove all but the newest
                    const toRemove = points.slice(1);
                    await collection.deleteMany({
                        _id: { $in: toRemove.map(p => p._id) }
                    });

                    removedCount += toRemove.length;
                    processedUsers.add(points[0].username);
                }
            }

            console.log(`[POINTS] Removed ${removedCount} duplicate records affecting ${processedUsers.size} users`);
            return { removedCount, processedUsers: Array.from(processedUsers) };
        } catch (error) {
            console.error('[POINTS] Error cleaning up duplicate points:', error);
            throw error;
        }
    }
}

module.exports = PointsManager;

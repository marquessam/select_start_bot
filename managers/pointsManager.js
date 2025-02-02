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
            participation: { value: 1, key: 'participation', requiresGame: true },
            beaten: { value: 3, key: 'beaten', requiresGame: true },
            mastery: { value: 3, key: 'mastery', requiresGame: true }
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
            
            // Use Map to ensure uniqueness by type and game combination
            const uniquePoints = new Map();
            
            bonusPoints
                .filter(point => point.year === targetYear)
                .forEach(point => {
                    const pointType = point.pointType || point.reason.toLowerCase().split(' - ')[1];
                    const key = `${pointType}-${point.gameId || 'none'}`;
                    
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

    validatePointsInput(pointType, gameId) {
        // Check if the point type requires a game ID
        if (this.pointTypes[pointType]?.requiresGame && !gameId) {
            console.log(`[POINTS] Error: Game ID required for ${pointType} points`);
            return false;
        }

        // Validate game ID exists in points config if provided
        if (gameId && !pointsConfig.monthlyGames[gameId]) {
            console.log(`[POINTS] Error: Invalid game ID ${gameId}`);
            return false;
        }

        return true;
    }

    async awardPoints(username, points, reason, gameId = null) {
        const operationId = `points-${username}-${Date.now()}`;
        this._activeOperations.set(operationId, true);

        try {
            const cleanUsername = username.toLowerCase().trim();
            const year = new Date().getFullYear().toString();
            
            // Extract point type from reason
            const pointType = reason.type || reason.toLowerCase().split(' - ')[1];
            
            // Validate input
            if (!this.validatePointsInput(pointType, gameId)) {
                return false;
            }

            // Create standardized technical key with proper game association
            const technicalKey = `${pointType}-${gameId || 'none'}`;

            console.log(`[POINTS] Checking ${username} for ${technicalKey}`);

            // Check for existing points using both technical key and game/type combination
            const existingPoints = await this.getUserPoints(cleanUsername, year);
            const hasExistingPoints = existingPoints.some(p => 
                p.technicalKey === technicalKey || 
                (p.gameId === gameId && p.pointType === pointType)
            );

            if (hasExistingPoints) {
                console.log(`[POINTS] ${username} already has ${pointType} points for game ${gameId || 'none'}`);
                return false;
            }

            // Create point record with improved metadata
            const pointRecord = {
                points,
                reason: reason.display || reason,
                internalReason: reason.internal || `${reason} (${technicalKey})`,
                technicalKey,
                pointType,
                gameId,
                year,
                date: new Date().toISOString(),
                metadata: {
                    gameConfig: gameId ? pointsConfig.monthlyGames[gameId] : null,
                    pointTypeConfig: this.pointTypes[pointType]
                }
            };

            // Use transaction to ensure data consistency
            const success = await withTransaction(this.database, async (session) => {
                return await this.database.addUserBonusPoints(cleanUsername, pointRecord);
            });

            if (success) {
                console.log(`[POINTS] Awarded ${points} ${pointType} points to ${username} for game ${gameId || 'none'}`);

                // Announce points if feed is active
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
            if (!gameConfig) {
                console.log(`[POINTS] No game config found for ${gameId}`);
                return [];
            }

            const points = [];
            const gameAchievements = achievements.filter(a => String(a.GameID) === String(gameId));

            // Check mastery only if game config allows it
            if (gameConfig.points?.mastery && gameConfig.masteryCheck) {
                const totalAchievements = gameAchievements.length;
                const completedAchievements = gameAchievements.filter(a => parseInt(a.DateEarned) > 0).length;
                
                if (totalAchievements > 0 && totalAchievements === completedAchievements) {
                    points.push({
                        type: 'mastery',
                        points: gameConfig.points.mastery,
                        reason: {
                            display: `${gameConfig.name} - Mastery`,
                            internal: `${gameConfig.name} - Mastery (100% completion)`,
                            type: 'mastery'
                        }
                    });
                }
            }

            // Check participation and completion
            if (gameConfig.points) {
                const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
                if (hasParticipation && gameConfig.points.participation) {
                    points.push({
                        type: 'participation',
                        points: gameConfig.points.participation,
                        reason: {
                            display: `${gameConfig.name} - Participation`,
                            internal: `${gameConfig.name} - Participation (earned achievement)`,
                            type: 'participation'
                        }
                    });
                }

                const isCompleted = gameConfig.requireProgression
                    ? this.checkProgressionRequirements(gameAchievements, gameConfig)
                    : this.checkWinConditions(gameAchievements, gameConfig);

                if (isCompleted && gameConfig.points.beaten) {
                    points.push({
                        type: 'beaten',
                        points: gameConfig.points.beaten,
                        reason: {
                            display: `${gameConfig.name} - Game Beaten`,
                            internal: `${gameConfig.name} - Game Beaten (completion verified)`,
                            type: 'beaten'
                        }
                    });
                }
            }

            // Award points with proper game association
            for (const point of points) {
                await this.awardPoints(username, point.points, point.reason, gameId);
            }

            return points;
        } catch (error) {
            console.error('[POINTS] Error checking historical points:', error);
            return [];
        }
    }

    checkProgressionRequirements(achievements, gameConfig) {
        // Check progression achievements
        const hasProgression = gameConfig.progression.every(achId =>
            achievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0)
        );

        // Check win conditions if progression is met
        if (hasProgression && gameConfig.winCondition?.length > 0) {
            if (gameConfig.requireAllWinConditions) {
                return gameConfig.winCondition.every(achId =>
                    achievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0)
                );
            }
            return gameConfig.winCondition.some(achId =>
                achievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0)
            );
        }

        return hasProgression;
    }

    checkWinConditions(achievements, gameConfig) {
        if (!gameConfig.winCondition?.length) return false;

        if (gameConfig.requireAllWinConditions) {
            return gameConfig.winCondition.every(achId =>
                achievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0)
            );
        }
        return gameConfig.winCondition.some(achId =>
            achievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0)
        );
    }

    async cleanupDuplicatePoints() {
        try {
            console.log('[POINTS] Starting duplicate points cleanup...');
            const collection = await this.database.getCollection('bonusPoints');
            const year = new Date().getFullYear().toString();
            
            const allPoints = await collection.find({ year }).toArray();
            
            // Group by unique combination of username, game, and point type
            const groupedPoints = new Map();
            
            allPoints.forEach(point => {
                const pointType = point.pointType || point.reason.toLowerCase().split(' - ')[1];
                const key = `${point.username}-${point.gameId || 'none'}-${pointType}`;
                
                if (!groupedPoints.has(key)) {
                    groupedPoints.set(key, []);
                }
                groupedPoints.get(key).push(point);
            });

            // Process duplicates
            let removedCount = 0;
            const processedUsers = new Set();

            for (const [key, points] of groupedPoints.entries()) {
                if (points.length > 1) {
                    // Sort by date and keep only the newest valid point
                    points.sort((a, b) => new Date(b.date) - new Date(a.date));
                    
                    // Keep the newest point that has valid game association if required
                    const validPoints = points.filter(p => 
                        !this.pointTypes[p.pointType]?.requiresGame || p.gameId
                    );

                    const toKeep = validPoints[0] || points[0];
                    const toRemove = points.filter(p => p._id !== toKeep._id);
                    
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

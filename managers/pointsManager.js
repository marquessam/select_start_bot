// managers/pointsManager.js

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

       this.gameConfig = {
    "319": {  // Chrono Trigger
        name: "Chrono Trigger",
        month: "JANUARY",
        points: {
            mastery: 3  // Available all year
        },
        monthlyOnlyPoints: {  // Only in January
            participation: 1,
            beaten: 3
        },
        progression: [2080, 2081, 2085, 2090, 2191, 2100, 2108, 2129, 2133],
        winCondition: [2266, 2281],
        requireProgression: true,
        requireAllWinConditions: false,
        masteryCheck: true
    },
    "10024": {  // Mario Tennis
        name: "Mario Tennis",
        month: "JANUARY",
        shadowGame: true,
        points: {
            participation: 1,
            beaten: 3
        },
        winCondition: [48411, 48412],
        requireAllWinConditions: false,
        masteryCheck: false,
        active: true
    },
    "355": {  // ALTTP
        name: "The Legend of Zelda: A Link to the Past",
        month: "FEBRUARY",
        points: {
            mastery: 3
        },
        monthlyOnlyPoints: {
            participation: 1,
            beaten: 3
        },
        progression: [944, 2192, 2282, 980, 2288, 2291, 2292, 2296, 2315, 2336, 2351,
                     2357, 2359, 2361, 2365, 2334, 2354, 2368, 2350, 2372, 2387],
        winCondition: [2389],
        requireProgression: true,
        requireAllWinConditions: true,
        masteryCheck: true
    },
    "274": {  // UN Squadron
        name: "U.N. Squadron",
        month: "FEBRUARY",
        shadowGame: true,
        points: {
            participation: 1,
            beaten: 3
        },
        progression: [6413, 6414, 6415, 6416, 6417, 6418, 6419, 6420, 6421],
        winCondition: [6422],
        requireProgression: true,
        requireAllWinConditions: true,
        masteryCheck: false,
        active: false
    }
           setServices(services) {
        this.services = services;
        console.log('[POINTS MANAGER] Services updated');
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
                    reason: this.createPointReason(
                        gameConfig.name,
                        'Mastery',
                        `mastery-${gameId}`
                    )
                });
            }
        }

        // Check monthly-only points if in correct month or historical
        if (gameConfig.monthlyOnlyPoints) {
            // Check participation
            if (gameConfig.monthlyOnlyPoints.participation) {
                const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
                if (hasParticipation) {
                    points.push({
                        type: 'participation',
                        points: gameConfig.monthlyOnlyPoints.participation,
                        reason: this.createPointReason(
                            gameConfig.name,
                            'Participation',
                            `participation-${gameId}`
                        )
                    });
                }
            }

            // Check beaten
            if (gameConfig.monthlyOnlyPoints.beaten) {
                const hasBeaten = await this.checkGameBeaten(gameAchievements, gameConfig);
                if (hasBeaten) {
                    points.push({
                        type: 'beaten',
                        points: gameConfig.monthlyOnlyPoints.beaten,
                        reason: this.createPointReason(
                            gameConfig.name,
                            'Game Beaten',
                            `beaten-${gameId}`
                        )
                    });
                }
            }
        }

        // Shadow game points
        if (gameConfig.shadowGame) {
            if (gameConfig.points.participation) {
                const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
                if (hasParticipation) {
                    points.push({
                        type: 'participation',
                        points: gameConfig.points.participation,
                        reason: this.createPointReason(
                            gameConfig.name,
                            'Participation',
                            `participation-${gameId}`
                        )
                    });
                }
            }

            if (gameConfig.points.beaten) {
                const hasBeaten = await this.checkGameBeaten(gameAchievements, gameConfig);
                if (hasBeaten) {
                    points.push({
                        type: 'beaten',
                        points: gameConfig.points.beaten,
                        reason: this.createPointReason(
                            gameConfig.name,
                            'Game Beaten',
                            `beaten-${gameId}`
                        )
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
    const gameConfig = this.gameConfig[gameId];
    if (!gameConfig) return [];

    const pointsToAward = [];
    const gameAchievements = achievements.filter(a => 
        String(a.GameID || a.gameId) === String(gameId)
    );

    // Check if this is a shadow game and if it's active
    const shadowGame = gameConfig.shadowGame;
    const shadowGameActive = await this.isShadowGameActive();
    
    if (shadowGame && !shadowGameActive) {
        return [];
    }

    // Generate unique technical keys for each point type
    const generateKey = (type) => {
        const year = new Date().getFullYear().toString();
        const month = new Date().getMonth() + 1;
        return `${type}-${gameId}-${year}-${month}`;
    };

    // Check participation
    if (gameConfig.points?.participation) {
        const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
        if (hasParticipation) {
            const participationKey = generateKey('participation');
            pointsToAward.push({
                type: 'participation',
                points: gameConfig.points.participation,
                reason: this.createPointReason(
                    gameConfig.name,
                    'Participation',
                    participationKey
                ),
                technicalKey: participationKey
            });
        }
    }

    // Check game beaten
    if (gameConfig.points?.beaten) {
        const hasBeaten = await this.checkGameBeaten(gameAchievements, gameConfig);
        if (hasBeaten) {
            const beatenKey = generateKey('beaten');
            pointsToAward.push({
                type: 'beaten',
                points: gameConfig.points.beaten,
                reason: this.createPointReason(
                    gameConfig.name,
                    'Game Beaten',
                    beatenKey
                ),
                technicalKey: beatenKey
            });
        }
    }

    // Check mastery
    if (gameConfig.points?.mastery && gameConfig.masteryCheck) {
        const hasMastery = await this.checkGameMastery(gameAchievements);
        if (hasMastery) {
            const masteryKey = generateKey('mastery');
            pointsToAward.push({
                type: 'mastery',
                points: gameConfig.points.mastery,
                reason: this.createPointReason(
                    gameConfig.name,
                    'Mastery',
                    masteryKey
                ),
                technicalKey: masteryKey
            });
        }
    }

    return pointsToAward;
}
async isShadowGameActive() {
    try {
        const shadowGame = await global.database.getShadowGame();
        return shadowGame?.active && shadowGame?.triforceState?.power?.collected;
    } catch (error) {
        console.error('Error checking shadow game status:', error);
        return false;
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

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

        // Valid game IDs for different challenges
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

    createPointReason(gameName, achievementType, technicalKey) {
        return {
            display: `${gameName} - ${achievementType}`,
            internal: `${gameName} - ${achievementType} (${technicalKey})`,
            key: technicalKey
        };
    }

    createBonusPointObject(username, gameId, points, pointType, reason) {
        return {
            points,
            reason: reason.display,
            internalReason: reason.internal,
            technicalKey: `${pointType}-${gameId}`,
            pointType,
            gameId,
            year: new Date().getFullYear().toString(),
            date: new Date().toISOString()
        };
    }

    async awardPoints(username, points, reason, gameId = null) {
        const operationId = `points-${username}-${Date.now()}`;
        this._activeOperations.set(operationId, true);

        try {
            console.log(`[POINTS] Awarding ${points} points to "${username}" for: ${reason}`);
            
            const cleanUsername = username.toLowerCase().trim();
            const year = new Date().getFullYear().toString();

            const pointRecord = {
                points,
                reason: reason.display || reason,
                internalReason: reason.internal || reason,
                technicalKey: gameId ? `${reason.key || 'bonus'}-${gameId}` : null,
                year,
                date: new Date().toISOString()
            };

            const success = await withTransaction(this.database, async (session) => {
                return await this.database.addUserBonusPoints(cleanUsername, pointRecord);
            });

            if (success) {
                this.cache.pendingUpdates.add(cleanUsername);
                console.log(`[POINTS] Successfully awarded points to ${username}`);
            }

            return success;

        } catch (error) {
            ErrorHandler.logError(error, `Award Points - ${username}`);
            return false;
        } finally {
            this._activeOperations.delete(operationId);
        }
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
            if (!gameConfig.masteryOnly && !await this.hasExistingPoints(username, gameId, 'participation', year)) {
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
                if (!await this.hasExistingPoints(username, gameId, 'beaten', year)) {
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
            }

            // Check mastery
            if (gameConfig.masteryCheck && await this.checkGameMastery(achievements)) {
                if (!await this.hasExistingPoints(username, gameId, 'mastery', year)) {
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
            }

            return points;
        } catch (error) {
            ErrorHandler.logError(error, `Check Game Points - ${username}`);
            return [];
        }
    }

    async checkGameBeaten(achievements, gameConfig) {
        try {
            if (!gameConfig.winCondition) return false;

            let hasBeaten = true;

            // Check progression achievements if required
            if (gameConfig.requireProgression && gameConfig.progression) {
                hasBeaten = gameConfig.progression.every(achId =>
                    achievements.some(a => 
                        parseInt(a.ID) === achId && 
                        parseInt(a.DateEarned) > 0
                    )
                );
            }

            // Check win condition achievements
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
            ErrorHandler.logError(error, 'Check Game Beaten');
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
            ErrorHandler.logError(error, 'Check Game Mastery');
            return false;
        }
    }

    async hasExistingPoints(username, gameId, pointType, year) {
        try {
            const bonusPoints = await this.database.getUserBonusPoints(username);
            return bonusPoints.some(bp => 
                bp.year === year && 
                bp.technicalKey === `${pointType}-${gameId}`
            );
        } catch (error) {
            ErrorHandler.logError(error, `Check Existing Points - ${username}`);
            return false;
        }
    }
    async getUserPoints(username, year = null) {
    try {
        const targetYear = year || new Date().getFullYear().toString();
        const cleanUsername = username.toLowerCase().trim();
        
        const bonusPoints = await this.database.getUserBonusPoints(cleanUsername);
        
        // Group by internal reason to prevent duplicates
        const uniquePoints = Object.values(
            bonusPoints.reduce((acc, point) => {
                // Only consider points from the target year
                if (point.year !== targetYear) return acc;

                const key = point.internalReason || point.reason;
                // If we already have this point type, only keep the newer one
                if (!acc[key] || new Date(point.date) > new Date(acc[key].date)) {
                    acc[key] = point;
                }
                return acc;
            }, {})
        );

        return uniquePoints.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
        console.error('[POINTS] Error getting user points:', error);
        return [];
    }
}
    async migrateExistingPoints() {
    try {
        console.log('[POINTS] Checking for points to migrate...');
        
        // Get old stats
        const userstats = await this.database.getUserStats();
        if (!userstats?.users) {
            console.log('[POINTS] No user stats found to migrate');
            return;
        }

        let migratedCount = 0;
        
        // Process each user's bonus points
        for (const [username, userData] of Object.entries(userstats.users)) {
            if (!userData.bonusPoints?.length) continue;

            for (const point of userData.bonusPoints) {
                try {
                    // Create new format point record
                    const pointRecord = {
                        points: point.points,
                        reason: point.reason,
                        internalReason: point.internalReason || point.reason,
                        technicalKey: point.technicalKey,
                        year: point.year || new Date(point.date).getFullYear().toString(),
                        date: point.date
                    };

                    // Try to add the points using our existing method
                    const success = await this.database.addUserBonusPoints(username, pointRecord);
                    if (success) {
                        migratedCount++;
                    }
                } catch (error) {
                    console.error(`[POINTS] Error migrating point for ${username}:`, error);
                }
            }
        }

        if (migratedCount > 0) {
            console.log(`[POINTS] Successfully migrated ${migratedCount} points`);
        }

    } catch (error) {
        console.error('[POINTS] Migration error:', error);
        }
    }
}

module.exports = PointsManager;

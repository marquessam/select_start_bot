// managers/pointsManager.js
const { withTransaction } = require('../utils/transactions');
const { monthlyGames, pointValues } = require('../monthlyGames');

class PointsManager {
    constructor(database) {
        this.database = database;
        this.services = null;
    }

    setServices(services) {
        this.services = services;
        console.log('[POINTS MANAGER] Services updated');
    }

    getCurrentMonthGames() {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return monthlyGames[monthKey];
    }

    isPastMonthlyGame(gameId) {
        return Object.values(monthlyGames).some(month => 
            month.monthlyGame.id === gameId && 
            month.monthlyGame.allowMastery
        );
    }

    async canAwardPoints(username, gameId, pointType) {
        const currentGames = this.getCurrentMonthGames();
        
        // Check if it's a current game
        const isCurrentMonthly = currentGames?.monthlyGame.id === gameId;
        const isCurrentShadow = currentGames?.shadowGame.id === gameId;
        
        // Handle Chrono Trigger special case
        if (gameId === "319" && pointType !== 'mastery') {
            return false;
        }

        // For past games, only allow mastery points
        if (!isCurrentMonthly && !isCurrentShadow) {
            return pointType === 'mastery' && this.isPastMonthlyGame(gameId);
        }

        // Don't allow mastery for shadow games
        if (isCurrentShadow && pointType === 'mastery') {
            return false;
        }

        return true;
    }

    async processNewAchievements(username, achievements) {
        try {
            // Group achievements by game
            const achievementsByGame = achievements.reduce((acc, ach) => {
                if (!acc[ach.GameID]) acc[ach.GameID] = [];
                acc[ach.GameID].push(ach);
                return acc;
            }, {});

            const points = [];
            for (const [gameId, gameAchievements] of Object.entries(achievementsByGame)) {
                const gamePoints = await this.processGameAchievements(username, gameId, gameAchievements);
                points.push(...gamePoints);
            }

            // Award points
            for (const point of points) {
                await this.awardPoints(username, point.points, point.reason);
            }

            return points;
        } catch (error) {
            console.error(`[POINTS] Error processing achievements for ${username}:`, error);
            return [];
        }
    }

    async processGameAchievements(username, gameId, achievements) {
        const currentGames = this.getCurrentMonthGames();
        const points = [];

        // Get game config
        let gameConfig = currentGames?.monthlyGame.id === gameId ? currentGames.monthlyGame :
                        currentGames?.shadowGame.id === gameId ? currentGames.shadowGame :
                        this.getPastMonthlyConfig(gameId);

        if (!gameConfig) return points;

        // Check if points already awarded
        const existingPoints = await this.getUserGamePoints(username, gameId);

        // Check participation (except for masteryOnly games)
        if (!gameConfig.masteryOnly && 
            !existingPoints.some(p => p.type === 'participation') &&
            await this.canAwardPoints(username, gameId, 'participation')) {
            
            if (achievements.some(a => parseInt(a.DateEarned) > 0)) {
                points.push({
                    type: 'participation',
                    points: pointValues.participation,
                    reason: {
                        display: `${gameConfig.name} - Participation`,
                        internal: `participation-${gameId}`,
                        key: `participation-${gameId}`
                    }
                });
            }
        }

        // Check beaten
        if (!existingPoints.some(p => p.type === 'beaten') &&
            await this.canAwardPoints(username, gameId, 'beaten')) {
            
            const isBeaten = this.checkBeatenRequirements(achievements, gameConfig);
            if (isBeaten) {
                points.push({
                    type: 'beaten',
                    points: pointValues.beaten,
                    reason: {
                        display: `${gameConfig.name} - Game Beaten`,
                        internal: `beaten-${gameId}`,
                        key: `beaten-${gameId}`
                    }
                });
            }
        }

        // Check mastery
        if (!existingPoints.some(p => p.type === 'mastery') &&
            gameConfig.allowMastery &&
            await this.canAwardPoints(username, gameId, 'mastery')) {
            
            const isMastered = this.checkMastery(achievements);
            if (isMastered) {
                points.push({
                    type: 'mastery',
                    points: pointValues.mastery,
                    reason: {
                        display: `${gameConfig.name} - Mastery`,
                        internal: `mastery-${gameId}`,
                        key: `mastery-${gameId}`
                    }
                });
            }
        }

        return points;
    }

    checkBeatenRequirements(achievements, gameConfig) {
        // Check progression achievements if required
        if (gameConfig.requireProgression && gameConfig.progression) {
            const hasProgression = gameConfig.progression.every(achId =>
                achievements.some(a => 
                    parseInt(a.ID) === achId && 
                    parseInt(a.DateEarned) > 0
                )
            );
            if (!hasProgression) return false;
        }

        // Check win conditions
        if (gameConfig.requireAllWinConditions) {
            return gameConfig.winConditions.every(achId =>
                achievements.some(a => 
                    parseInt(a.ID) === achId && 
                    parseInt(a.DateEarned) > 0
                )
            );
        } else {
            return gameConfig.winConditions.some(achId =>
                achievements.some(a => 
                    parseInt(a.ID) === achId && 
                    parseInt(a.DateEarned) > 0
                )
            );
        }
    }

    checkMastery(achievements) {
        const total = achievements.length;
        const earned = achievements.filter(a => parseInt(a.DateEarned) > 0).length;
        return total > 0 && total === earned;
    }

    getPastMonthlyConfig(gameId) {
        for (const month of Object.values(monthlyGames)) {
            if (month.monthlyGame.id === gameId) {
                return month.monthlyGame;
            }
        }
        return null;
    }

    async getUserGamePoints(username, gameId) {
        const year = new Date().getFullYear().toString();
        const points = await this.database.getUserBonusPoints(username);
        return points.filter(p => 
            p.year === year && 
            p.gameId === gameId &&
            p.technicalKey && 
            p.technicalKey.endsWith(`-${gameId}`)
        );
    }

    async awardPoints(username, points, reason) {
        try {
            const cleanUsername = username.toLowerCase().trim();
            const year = new Date().getFullYear().toString();

            const pointRecord = {
                points,
                reason: reason.display,
                internalReason: reason.internal,
                technicalKey: reason.key,
                gameId: reason.key.split('-').pop(),
                type: reason.key.split('-')[0],
                year,
                date: new Date().toISOString()
            };

            const success = await withTransaction(this.database, async (session) => {
                return await this.database.addUserBonusPoints(cleanUsername, pointRecord);
            });

            if (success && this.services?.achievementFeed) {
                await this.services.achievementFeed.announcePointsAward(
                    username, 
                    points, 
                    pointRecord.reason
                );
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

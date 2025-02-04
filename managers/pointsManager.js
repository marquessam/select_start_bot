// managers/pointsManager.js
const { withTransaction } = require('../utils/transactions');
const monthlyGames = {
    // Key format: YYYY-MM
    "2024-01": {
        monthlyGame: {
            id: "319",
            name: "Chrono Trigger",
            winConditions: [2266, 2281], // Achievement IDs for "beating" the game
            allowMastery: true // Can earn mastery points for this game
        },
        shadowGame: {
            id: "10024",
            name: "Mario Tennis",
            winConditions: [48411, 48412],
            allowMastery: false // Shadow games never give mastery points
        }
    },
    "2024-02": {
        monthlyGame: {
            id: "355",
            name: "The Legend of Zelda: A Link to the Past",
            winConditions: [2389],
            allowMastery: true
        },
        shadowGame: {
            id: "274",
            name: "U.N. Squadron",
            winConditions: [6422],
            allowMastery: false
        }
    }
};

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

    async processNewAchievements(username, achievements) {
        try {
            const points = await this.processAchievements(username, achievements);
            
            for (const point of points) {
                await this.awardPoints(username, point.points, point.reason);
            }

            return points;
        } catch (error) {
            console.error(`[POINTS] Error processing achievements for ${username}:`, error);
            return [];
        }
    }

    async processAchievements(username, achievements) {
        const currentGames = this.getCurrentMonthGames();
        if (!currentGames) return [];

        const points = [];

        // Check current monthly game
        const monthlyAchievements = achievements.filter(a => a.GameID === currentGames.monthlyGame.id);
        if (monthlyAchievements.length > 0) {
            const monthlyPoints = await this.checkGameProgress(
                monthlyAchievements,
                currentGames.monthlyGame,
                true
            );
            points.push(...monthlyPoints);
        }

        // Check current shadow game
        const shadowAchievements = achievements.filter(a => a.GameID === currentGames.shadowGame.id);
        if (shadowAchievements.length > 0) {
            const shadowPoints = await this.checkGameProgress(
                shadowAchievements,
                currentGames.shadowGame,
                false
            );
            points.push(...shadowPoints);
        }

        // Check past monthly games for mastery
        const uniqueGameIds = [...new Set(achievements.map(a => a.GameID))];
        for (const gameId of uniqueGameIds) {
            if (this.isPastMonthlyGame(gameId)) {
                const pastGameAchievements = achievements.filter(a => a.GameID === gameId);
                const isMastered = this.checkMastery(pastGameAchievements);
                if (isMastered) {
                    const gameName = this.getGameName(gameId);
                    points.push({
                        type: 'mastery',
                        points: 3,
                        reason: {
                            display: `${gameName} - Mastery`,
                            internal: `mastery-${gameId}`,
                            key: `mastery-${gameId}`
                        }
                    });
                }
            }
        }

        return points;
    }

    async checkGameProgress(achievements, gameConfig, isMonthly) {
        const points = [];
        
        // Check participation (1 point)
        if (achievements.some(a => parseInt(a.DateEarned) > 0)) {
            points.push({
                type: 'participation',
                points: 1,
                reason: {
                    display: `${gameConfig.name} - Participation`,
                    internal: `participation-${gameConfig.id}`,
                    key: `participation-${gameConfig.id}`
                }
            });
        }

        // Check beaten (3 points)
        const isBeaten = gameConfig.winConditions.every(achId =>
            achievements.some(a => 
                parseInt(a.ID) === achId && 
                parseInt(a.DateEarned) > 0
            )
        );

        if (isBeaten) {
            points.push({
                type: 'beaten',
                points: 3,
                reason: {
                    display: `${gameConfig.name} - Game Beaten`,
                    internal: `beaten-${gameConfig.id}`,
                    key: `beaten-${gameConfig.id}`
                }
            });
        }

        // Check mastery for monthly games (3 points)
        if (isMonthly && gameConfig.allowMastery) {
            const isMastered = this.checkMastery(achievements);
            if (isMastered) {
                points.push({
                    type: 'mastery',
                    points: 3,
                    reason: {
                        display: `${gameConfig.name} - Mastery`,
                        internal: `mastery-${gameConfig.id}`,
                        key: `mastery-${gameConfig.id}`
                    }
                });
            }
        }

        return points;
    }

    checkMastery(achievements) {
        const totalAchievements = achievements.length;
        const earnedAchievements = achievements.filter(a => parseInt(a.DateEarned) > 0).length;
        return totalAchievements > 0 && totalAchievements === earnedAchievements;
    }

    getGameName(gameId) {
        for (const month of Object.values(monthlyGames)) {
            if (month.monthlyGame.id === gameId) return month.monthlyGame.name;
            if (month.shadowGame.id === gameId) return month.shadowGame.name;
        }
        return 'Unknown Game';
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

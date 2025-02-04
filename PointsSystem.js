// PointsSystem.js
const monthlyGames = require('./monthlyGames');

class PointsSystem {
    constructor(database) {
        this.database = database;
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

    async processAchievements(username, achievements) {
        const currentGames = this.getCurrentMonthGames();
        if (!currentGames) return [];

        const points = [];

        // Check current monthly game
        if (achievements.some(a => a.GameID === currentGames.monthlyGame.id)) {
            const monthlyPoints = await this.checkGameProgress(
                username,
                achievements,
                currentGames.monthlyGame,
                true
            );
            points.push(...monthlyPoints);
        }

        // Check current shadow game
        if (achievements.some(a => a.GameID === currentGames.shadowGame.id)) {
            const shadowPoints = await this.checkGameProgress(
                username,
                achievements,
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

    async checkGameProgress(username, achievements, gameConfig, isMonthly) {
        const points = [];
        const gameAchievements = achievements.filter(a => a.GameID === gameConfig.id);
        
        // Check participation (1 point)
        if (gameAchievements.some(a => parseInt(a.DateEarned) > 0)) {
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
            gameAchievements.some(a => 
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
            const isMastered = this.checkMastery(gameAchievements);
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
}

module.exports = PointsSystem;

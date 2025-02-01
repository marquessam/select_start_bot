// pointsManager.js
const { withTransaction } = require('./utils/transactions');
const ErrorHandler = require('./utils/errorHandler');

class PointsManager {
    constructor(database) {
        this.database = database;
        this.cache = {
            pendingUpdates: new Set(),
            lastUpdate: null,
            updateInterval: 5 * 60 * 1000 // 5 minutes
        };
        
        // Points configuration
        this.pointTypes = {
            participation: { value: 1, key: 'participation' },
            beaten: { value: 3, key: 'beaten' },
            mastery: { value: 3, key: 'mastery' }
        };
    }

    async awardPoints(username, points, reason, gameId = null) {
        const operationId = `points-${username}-${Date.now()}`;
        
        try {
            const cleanUsername = username.toLowerCase().trim();
            const year = new Date().getFullYear().toString();

            // Validate point award
            if (!await this.validatePointAward(cleanUsername, points, reason)) {
                return false;
            }

            // Create point record
            const pointRecord = {
                points,
                reason: reason.displayReason || reason,
                internalReason: reason.internalReason || reason,
                technicalKey: gameId ? `${reason.key || 'bonus'}-${gameId}` : null,
                year,
                date: new Date().toISOString()
            };

            // Award points with transaction
            await withTransaction(this.database, async (session) => {
                await this.database.addUserBonusPoints(cleanUsername, pointRecord);
            });

            this.cache.pendingUpdates.add(cleanUsername);
            return true;

        } catch (error) {
            ErrorHandler.logError(error, `Award Points - ${username}`);
            return false;
        }
    }

    async validatePointAward(username, points, reason) {
        // Add validation logic here
        return true; // Placeholder
    }

    async checkGameProgress(username, achievements, gameId) {
        const gamePoints = [];
        const gameConfig = this.getGameConfig(gameId);

        if (!gameConfig) return gamePoints;

        // Check participation
        if (await this.checkParticipation(username, achievements, gameId)) {
            gamePoints.push({
                type: 'participation',
                points: this.pointTypes.participation.value
            });
        }

        // Check completion
        if (await this.checkCompletion(username, achievements, gameId)) {
            gamePoints.push({
                type: 'beaten',
                points: this.pointTypes.beaten.value
            });
        }

        // Check mastery
        if (await this.checkMastery(username, achievements, gameId)) {
            gamePoints.push({
                type: 'mastery',
                points: this.pointTypes.mastery.value
            });
        }

        return gamePoints;
    }

    getGameConfig(gameId) {
        // Add game configuration logic here
        return null; // Placeholder
    }

    // Add other helper methods as needed
}

module.exports = PointsManager;

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

        // Track operations
        this._activeOperations = new Map();
    }

    // Helper method to create point reason
    createPointReason(gameName, achievementType, technicalKey) {
        return {
            display: `${gameName} - ${achievementType}`,
            internal: `${gameName} - ${achievementType} (${technicalKey})`,
            key: technicalKey
        };
    }

    // Helper method to create bonus point object
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

            // Create standardized point record
            const pointRecord = {
                points,
                reason: reason.display || reason,
                internalReason: reason.internal || reason,
                technicalKey: gameId ? `${reason.key || 'bonus'}-${gameId}` : null,
                year,
                date: new Date().toISOString()
            };

            // Award points with transaction
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
}

module.exports = PointsManager;

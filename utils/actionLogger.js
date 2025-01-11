// utils/actionLogger.js
const logger = require('./logger');
const database = require('../database');

class ActionLogger {
    constructor() {
        this.actionTypes = {
            COMMAND: 'COMMAND',
            ACHIEVEMENT: 'ACHIEVEMENT',
            POINTS: 'POINTS',
            ADMIN: 'ADMIN',
            SYSTEM: 'SYSTEM'
        };
    }

    async logAction(type, data) {
        try {
            // Log to file
            logger.info(`Action: ${type}`, data);

            // Store in database
            await this.storeAction(type, data);

        } catch (error) {
            logger.error('Failed to log action', {
                type,
                data,
                error: error.message
            });
        }
    }

    async storeAction(type, data) {
        const actionData = {
            type,
            timestamp: new Date(),
            ...data
        };

        await database.db.collection('action_logs').insertOne(actionData);
    }

    async logCommand(message, command, success, error = null) {
        const actionData = {
            userId: message.author.id,
            username: message.author.username,
            command: command.name,
            channel: message.channel.name,
            guildId: message.guild?.id,
            success,
            error: error?.message,
            timestamp: new Date()
        };

        await this.logAction(this.actionTypes.COMMAND, actionData);
    }

    async logAchievement(username, achievement, game) {
        const actionData = {
            username,
            achievement: {
                id: achievement.ID,
                title: achievement.Title,
                points: achievement.Points
            },
            game: {
                id: game.id,
                title: game.title
            },
            timestamp: new Date()
        };

        await this.logAction(this.actionTypes.ACHIEVEMENT, actionData);
    }

    async logPointsChange(username, points, reason, admin = null) {
        const actionData = {
            username,
            points,
            reason,
            admin,
            timestamp: new Date()
        };

        await this.logAction(this.actionTypes.POINTS, actionData);
    }

    async logAdminAction(admin, action, target, details) {
        const actionData = {
            admin,
            action,
            target,
            details,
            timestamp: new Date()
        };

        await this.logAction(this.actionTypes.ADMIN, actionData);
    }

    async logSystemEvent(event, details) {
        const actionData = {
            event,
            details,
            timestamp: new Date()
        };

        await this.logAction(this.actionTypes.SYSTEM, actionData);
    }

    async getRecentActions(type = null, limit = 100) {
        const query = type ? { type } : {};
        
        return await database.db.collection('action_logs')
            .find(query)
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    }

    async getUserActions(username, type = null, limit = 100) {
        const query = {
            username,
            ...(type && { type })
        };
        
        return await database.db.collection('action_logs')
            .find(query)
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    }

    async getActionStats(startDate, endDate = new Date()) {
        const query = {
            timestamp: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        };

        const stats = await database.db.collection('action_logs').aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    users: { $addToSet: '$username' }
                }
            }
        ]).toArray();

        return stats.map(stat => ({
            type: stat._id,
            count: stat.count,
            uniqueUsers: stat.users.length
        }));
    }
}

module.exports = new ActionLogger();

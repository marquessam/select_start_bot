const fs = require('fs');
const path = require('path');

class BotError extends Error {
    constructor(message, type, context, originalError = null) {
        super(message);
        this.name = 'BotError';
        this.type = type;
        this.context = context;
        this.originalError = originalError;
        this.timestamp = new Date();
    }
}

class ErrorHandler {
    static ERROR_TYPES = {
        DATABASE: 'DATABASE_ERROR',
        API: 'API_ERROR',
        VALIDATION: 'VALIDATION_ERROR',
        PERMISSION: 'PERMISSION_ERROR',
        RATE_LIMIT: 'RATE_LIMIT_ERROR',
        CACHE: 'CACHE_ERROR',
        UNKNOWN: 'UNKNOWN_ERROR',
    };

    static getErrorType(error) {
        if (error.name === 'MongoError' || error.name === 'MongoServerError') {
            return this.ERROR_TYPES.DATABASE;
        }
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return this.ERROR_TYPES.API;
        }
        if (error.name === 'ValidationError') {
            return this.ERROR_TYPES.VALIDATION;
        }
        if (error.message?.toLowerCase().includes('permission')) {
            return this.ERROR_TYPES.PERMISSION;
        }
        if (error.message?.toLowerCase().includes('rate limit')) {
            return this.ERROR_TYPES.RATE_LIMIT;
        }
        return this.ERROR_TYPES.UNKNOWN;
    }

    static async logError(error, context) {
        const errorType = this.getErrorType(error);
        const timestamp = new Date().toISOString();
        const logDir = path.resolve(__dirname, '../logs');
        const logPath = path.join(logDir, 'error.log');

        // Ensure log directory exists
        try {
            await fs.promises.mkdir(logDir, { recursive: true });
        } catch (mkdirError) {
            console.error(`[LOG ERROR] Failed to create log directory: ${mkdirError.message}`);
        }

        const logMessage = `[${timestamp}] [${errorType}] [${context}] ${error.stack || error.message}\n`;

        // Log to console
        console.error(logMessage);

        // Log to file
        try {
            await fs.promises.appendFile(logPath, logMessage);
        } catch (writeError) {
            console.error(`[LOG ERROR] Failed to write to log file: ${writeError.message}`);
        }

        // Return formatted error for Discord messages
        return `\`\`\`ansi\n\x1b[31m[ERROR] ${context}: ${error.message}\x1b[0m\`\`\``;
    }

    static handleDatabaseError(error, operation) {
        const botError = new BotError(
            'Database operation failed',
            this.ERROR_TYPES.DATABASE,
            operation,
            error
        );
        return this.logError(botError, 'Database Operation');
    }

    static handleAPIError(error, endpoint) {
        const botError = new BotError(
            'API request failed',
            this.ERROR_TYPES.API,
            endpoint,
            error
        );
        return this.logError(botError, 'API Request');
    }

    static handleValidationError(error, data) {
        const botError = new BotError(
            'Validation failed',
            this.ERROR_TYPES.VALIDATION,
            JSON.stringify(data),
            error
        );
        return this.logError(botError, 'Validation');
    }

    static async cleanupOldLogs(daysToKeep = 7) {
        try {
            const logDir = path.resolve(__dirname, '../logs');
            const files = await fs.promises.readdir(logDir);
            const now = Date.now();

            for (const file of files) {
                const filePath = path.join(logDir, file);
                const stats = await fs.promises.stat(filePath);
                const fileAge = (now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

                if (fileAge > daysToKeep) {
                    await fs.promises.unlink(filePath);
                }
            }
        } catch (error) {
            console.error(`[LOG CLEANUP ERROR] Failed to cleanup logs: ${error.message}`);
        }
    }
}

module.exports = ErrorHandler;

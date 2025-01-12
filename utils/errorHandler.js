// utils/errorHandler.js

class ErrorHandler {
    static ERROR_TYPES = {
        API: 'API_ERROR',
        DATABASE: 'DATABASE_ERROR',
        VALIDATION: 'VALIDATION_ERROR',
        PERMISSION: 'PERMISSION_ERROR'
    };

    static logError(error, context) {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [${context}]:`, error);
    }

    static handleAPIError(error, context) {
        this.logError(error, `API_ERROR - ${context}`);
        return error.message;
    }

    static handleDatabaseError(error, context) {
        this.logError(error, `DATABASE_ERROR - ${context}`);
        return error.message;
    }

    static handleValidationError(error, details) {
        this.logError(error, `VALIDATION_ERROR - ${JSON.stringify(details)}`);
        return error.message;
    }
}

class BotError extends Error {
    constructor(message, type, context, originalError = null) {
        super(message);
        this.name = 'BotError';
        this.type = type;
        this.context = context;
        this.originalError = originalError;
    }
}

module.exports = {
    ErrorHandler,
    BotError
};

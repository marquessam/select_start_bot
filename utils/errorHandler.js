// utils/errorHandler.js

const logError = (error, context) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${context}]:`, error);
};

const handleAPIError = (error, context) => {
    logError(error, `API_ERROR - ${context}`);
    return error.message;
};

const handleDatabaseError = (error, context) => {
    logError(error, `DATABASE_ERROR - ${context}`);
    return error.message;
};

const handleValidationError = (error, details) => {
    logError(error, `VALIDATION_ERROR - ${JSON.stringify(details)}`);
    return error.message;
};

const ERROR_TYPES = {
    API: 'API_ERROR',
    DATABASE: 'DATABASE_ERROR',
    VALIDATION: 'VALIDATION_ERROR',
    PERMISSION: 'PERMISSION_ERROR'
};

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
    logError,
    handleAPIError,
    handleDatabaseError,
    handleValidationError,
    ERROR_TYPES,
    BotError
};

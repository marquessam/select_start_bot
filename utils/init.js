// utils/init.js
const fs = require('fs');
const path = require('path');

// Initialize required directories
function initializeDirs() {
    const dirs = [
        path.resolve(__dirname, '../logs'),
        path.resolve(__dirname, '../data'),
        path.resolve(__dirname, '../temp')
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

// Initialize utilities in correct order
function initializeUtils() {
    // First initialize directories
    initializeDirs();

    // Then initialize utilities in order
    const errorHandler = require('./errorHandler');
    const logger = require('./logger');
    const validators = require('./validators');
    const cacheManager = require('./cacheManager');
    const transactions = require('./transactions');

    return {
        errorHandler,
        logger,
        validators,
        cacheManager,
        transactions
    };
}

module.exports = { initializeUtils };

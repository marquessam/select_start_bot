const fs = require('fs');
const path = require('path');

class ErrorHandler {
    static logError(error, context) {
        const logPath = path.resolve(__dirname, '../logs/error.log');
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${context}] ${error.stack || error.message}\n`;

        console.error(logMessage); // Log to console
        fs.appendFileSync(logPath, logMessage); // Append to a log file
    }
}

module.exports = ErrorHandler;

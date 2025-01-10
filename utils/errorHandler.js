import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Create __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ErrorHandler {
    static logError(error, context) {
        const logPath = path.resolve(__dirname, '../logs/error.log');
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${context}] ${error.stack || error.message}\n`;

        console.error(logMessage); // Log to console
        fs.appendFileSync(logPath, logMessage); // Append to a log file
    }
}

export default ErrorHandler;

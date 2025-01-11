// utils/logger.js
const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.resolve(__dirname, '../logs');
        this.logLevels = {
            ERROR: 0,
            WARN: 1,
            INFO: 2,
            DEBUG: 3
        };
        
        this.currentLevel = this.logLevels.INFO;
        this.maxLogSize = 5 * 1024 * 1024; // 5MB
        this.maxLogFiles = 5;
        
        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        // Initialize log streams
        this.streams = {
            error: this.createStream('error'),
            warn: this.createStream('warn'),
            info: this.createStream('info'),
            debug: this.createStream('debug')
        };
        
        // Start log rotation check
        setInterval(() => this.checkRotation(), 60 * 60 * 1000); // Check every hour
    }

    createStream(level) {
        return fs.createWriteStream(
            path.join(this.logDir, `${level}.log`),
            { flags: 'a' }
        );
    }

    formatMessage(level, message, context = {}) {
        const timestamp = new Date().toISOString();
        const contextStr = Object.entries(context)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ');
        
        return `[${timestamp}] [${level}] ${message} ${contextStr}\n`;
    }

    log(level, message, context = {}) {
        if (this.logLevels[level] > this.currentLevel) return;

        const formattedMessage = this.formatMessage(level, message, context);
        
        // Write to appropriate stream
        switch(level) {
            case 'ERROR':
                this.streams.error.write(formattedMessage);
                console.error(formattedMessage);
                break;
            case 'WARN':
                this.streams.warn.write(formattedMessage);
                console.warn(formattedMessage);
                break;
            case 'INFO':
                this.streams.info.write(formattedMessage);
                console.log(formattedMessage);
                break;
            case 'DEBUG':
                this.streams.debug.write(formattedMessage);
                if (process.env.NODE_ENV === 'development') {
                    console.debug(formattedMessage);
                }
                break;
        }
    }

    async checkRotation() {
        try {
            for (const level of Object.keys(this.streams)) {
                const logPath = path.join(this.logDir, `${level}.log`);
                const stats = await fs.promises.stat(logPath);
                
                if (stats.size >= this.maxLogSize) {
                    await this.rotateLog(level);
                }
            }
            
            // Clean up old logs
            await this.cleanOldLogs();
        } catch (error) {
            console.error('Error during log rotation:', error);
        }
    }

    async rotateLog(level) {
        const basePath = path.join(this.logDir, level);
        
        // Close current stream
        this.streams[level].end();
        
        // Rotate files
        for (let i = this.maxLogFiles - 1; i >= 0; i--) {
            const oldPath = `${basePath}${i > 0 ? i : ''}.log`;
            const newPath = `${basePath}${i + 1}.log`;
            
            if (await this.fileExists(oldPath)) {
                await fs.promises.rename(oldPath, newPath);
            }
        }
        
        // Create new stream
        this.streams[level] = this.createStream(level);
    }

    async cleanOldLogs() {
        const files = await fs.promises.readdir(this.logDir);
        
        for (const file of files) {
            if (file.match(/\.\d+\.log$/)) {
                const filePath = path.join(this.logDir, file);
                const stats = await fs.promises.stat(filePath);
                const daysOld = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
                
                if (daysOld > 30) { // Delete logs older than 30 days
                    await fs.promises.unlink(filePath);
                }
            }
        }
    }

    async fileExists(path) {
        try {
            await fs.promises.access(path);
            return true;
        } catch {
            return false;
        }
    }

    error(message, context = {}) {
        this.log('ERROR', message, context);
    }

    warn(message, context = {}) {
        this.log('WARN', message, context);
    }

    info(message, context = {}) {
        this.log('INFO', message, context);
    }

    debug(message, context = {}) {
        this.log('DEBUG', message, context);
    }

    setLevel(level) {
        if (this.logLevels[level] !== undefined) {
            this.currentLevel = this.logLevels[level];
        }
    }

    async getStats() {
        const stats = {
            totalSize: 0,
            fileCount: 0,
            oldestLog: null,
            newestLog: null
        };

        const files = await fs.promises.readdir(this.logDir);
        for (const file of files) {
            if (file.endsWith('.log')) {
                const filePath = path.join(this.logDir, file);
                const fileStats = await fs.promises.stat(filePath);
                
                stats.totalSize += fileStats.size;
                stats.fileCount++;
                
                if (!stats.oldestLog || fileStats.mtime < stats.oldestLog) {
                    stats.oldestLog = fileStats.mtime;
                }
                if (!stats.newestLog || fileStats.mtime > stats.newestLog) {
                    stats.newestLog = fileStats.mtime;
                }
            }
        }

        return stats;
    }
}

// Export singleton instance
module.exports = new Logger();

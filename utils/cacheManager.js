// utils/cacheManager.js
const ErrorHandler = require('./errorHandler');

class CacheManager {
    constructor(options = {}) {
        this.cache = new Map();
        this.expiryTimes = new Map();
        this.defaultTTL = options.defaultTTL || 5 * 60 * 1000; // 5 minutes
        this.maxSize = options.maxSize || 1000;
        this.lastCleanup = Date.now();
        this.cleanupInterval = options.cleanupInterval || 60 * 1000; // 1 minute
    }

    set(key, value, ttl = this.defaultTTL) {
        try {
            // Clean up if necessary before setting new value
            if (this.cache.size >= this.maxSize) {
                this.cleanup();
            }

            this.cache.set(key, value);
            this.expiryTimes.set(key, Date.now() + ttl);

            return true;
        } catch (error) {
            ErrorHandler.logError(error, 'Cache Set Operation');
            return false;
        }
    }

    get(key) {
        try {
            // Check if cleanup is needed
            if (Date.now() - this.lastCleanup > this.cleanupInterval) {
                this.cleanup();
            }

            // Check if key exists and hasn't expired
            if (!this.cache.has(key) || Date.now() > this.expiryTimes.get(key)) {
                return null;
            }

            return this.cache.get(key);
        } catch (error) {
            ErrorHandler.logError(error, 'Cache Get Operation');
            return null;
        }
    }

    invalidate(key) {
        this.cache.delete(key);
        this.expiryTimes.delete(key);
    }

    cleanup() {
        try {
            const now = Date.now();
            for (const [key, expiry] of this.expiryTimes) {
                if (now > expiry) {
                    this.cache.delete(key);
                    this.expiryTimes.delete(key);
                }
            }
            this.lastCleanup = now;
        } catch (error) {
            ErrorHandler.logError(error, 'Cache Cleanup');
        }
    }

    clear() {
        this.cache.clear();
        this.expiryTimes.clear();
        this.lastCleanup = Date.now();
    }

    async getOrFetch(key, fetchFn, ttl = this.defaultTTL) {
        let value = this.get(key);
        if (value !== null) {
            return value;
        }

        try {
            value = await fetchFn();
            this.set(key, value, ttl);
            return value;
        } catch (error) {
            ErrorHandler.logError(error, 'Cache Fetch Operation');
            throw error;
        }
    }
}

module.exports = CacheManager;

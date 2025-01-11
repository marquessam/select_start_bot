// raAPI.js
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { ErrorHandler, BotError } = require('./utils/errorHandler');
const CacheManager = require('./utils/cacheManager');
const logger = require('./utils/logger');

class RetroAchievementsAPI {
    constructor(database) {
        this.database = database;
        
        // API configuration
        this.baseUrl = 'https://retroachievements.org/API';
        this.username = process.env.RA_USERNAME;
        this.apiKey = process.env.RA_API_KEY;

        // Rate limiting
        this.rateLimit = {
            maxRequests: 10,
            timeWindow: 60 * 1000, // 1 minute
            requests: new Map(), // timestamp -> request count
            queue: [],
            processing: false
        };

        // Initialize caches
        this.profileCache = new CacheManager({
            defaultTTL: 60 * 60 * 1000, // 1 hour
            maxSize: 500
        });

        this.leaderboardCache = new CacheManager({
            defaultTTL: 5 * 60 * 1000, // 5 minutes
            maxSize: 100
        });

        // Retry configuration
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds
    }

    async makeRequest(endpoint, params = {}, retryCount = 0) {
        try {
            // Add API credentials
            params.z = this.username;
            params.y = this.apiKey;

            // Build URL
            const url = new URL(`${this.baseUrl}/${endpoint}`);
            Object.keys(params).forEach(key => 
                url.searchParams.append(key, params[key])
            );

            // Check rate limit
            await this.checkRateLimit();

            // Make request
            const response = await fetch(url.toString());
            this.recordRequest();

            if (!response.ok) {
                throw new BotError(
                    `API request failed: ${response.statusText}`,
                    ErrorHandler.ERROR_TYPES.API,
                    endpoint
                );
            }

            return await response.json();
        } catch (error) {
            // Handle retries
            if (retryCount < this.maxRetries) {
                await new Promise(resolve => 
                    setTimeout(resolve, this.retryDelay * (retryCount + 1))
                );
                return this.makeRequest(endpoint, params, retryCount + 1);
            }

            throw error;
        }
    }

    async checkRateLimit() {
        const now = Date.now();

        // Clean up old requests
        for (const [timestamp] of this.rateLimit.requests) {
            if (now - timestamp > this.rateLimit.timeWindow) {
                this.rateLimit.requests.delete(timestamp);
            }
        }

        // Count recent requests
        let recentRequests = 0;
        for (const count of this.rateLimit.requests.values()) {
            recentRequests += count;
        }

        // If we're at the limit, wait
        if (recentRequests >= this.rateLimit.maxRequests) {
            const oldestTimestamp = Math.min(...this.rateLimit.requests.keys());
            const waitTime = oldestTimestamp + this.rateLimit.timeWindow - now;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    recordRequest() {
        const timestamp = Date.now();
        const currentCount = this.rateLimit.requests.get(timestamp) || 0;
        this.rateLimit.requests.set(timestamp, currentCount + 1);
    }

    async fetchUserProfile(username) {
        try {
            const data = await this.makeRequest('API_GetUserSummary.php', { u: username });
            return {
                username: data.Username,
                profileImage: `https://retroachievements.org${data.UserPic}`,
                profileUrl: `https://retroachievements.org/user/${data.Username}`
            };
        } catch (error) {
            logger.error(`Error fetching profile for ${username}:`, {
                error: error.message,
                username
            });
            return {
                username,
                profileImage: `https://retroachievements.org/UserPic/${username}.png`,
                profileUrl: `https://retroachievements.org/user/${username}`
            };
        }
    }

    async fetchLeaderboardData() {
        try {
            const data = await this.makeRequest('API_GetGameInfoAndUserProgress.php', {
                g: process.env.CURRENT_GAME_ID
            });

            const leaderboard = [];
            const users = await this.database.getValidUsers();

            for (const username of users) {
                try {
                    const progress = await this.fetchUserProgress(username, process.env.CURRENT_GAME_ID);
                    if (progress) {
                        leaderboard.push({
                            username,
                            completedAchievements: progress.achievements.filter(a => parseInt(a.DateEarned) > 0).length,
                            totalAchievements: progress.achievements.length,
                            completionPercentage: progress.completionPercentage,
                            achievements: progress.achievements
                        });
                    }
                } catch (error) {
                    logger.warn(`Error fetching progress for ${username}`, { 
                        error: error.message,
                        username 
                    });
                }
            }

            // Always return a valid response even if empty
            return {
                leaderboard: leaderboard.sort((a, b) => b.completionPercentage - a.completionPercentage),
                lastUpdated: new Date().toISOString()
            };
            
        } catch (error) {
            logger.error('Error fetching leaderboard:', {
                error: error.message,
                context: 'API Request'
            });
            // Return empty data instead of throwing
            return {
                leaderboard: [],
                lastUpdated: new Date().toISOString()
            };
        }
    }

    async fetchUserProgress(username, gameId) {
        try {
            const data = await this.makeRequest('API_GetUserProgress.php', {
                u: username,
                g: gameId
            });

            return {
                username: data.User,
                gameId: gameId,
                achievements: data.Achievements || [],
                totalScore: parseInt(data.TotalScore) || 0,
                completionPercentage: parseFloat(data.PctWon) || 0
            };
        } catch (error) {
            logger.error('Error fetching user progress:', {
                username,
                gameId,
                error: error.message
            });
            return null;
        }
    }

    async fetchGameInfo(gameId) {
        try {
            const data = await this.makeRequest('API_GetGame.php', { i: gameId });
            return {
                id: gameId,
                title: data.Title,
                console: data.Console,
                imageIcon: data.ImageIcon,
                achievements: data.Achievements || []
            };
        } catch (error) {
            logger.error('Error fetching game info:', {
                gameId,
                error: error.message
            });
            return null;
        }
    }

    clearCache() {
        this.profileCache.clear();
        this.leaderboardCache.clear();
    }
}

// Singleton instance management
let apiInstance = null;

function initializeAPI(database) {
    if (!apiInstance) {
        apiInstance = new RetroAchievementsAPI(database);
    }
    return apiInstance;
}

// Export both initialization and wrapper functions
module.exports = {
    initialize: initializeAPI,
    fetchLeaderboardData: () => apiInstance ? apiInstance.fetchLeaderboardData() : Promise.reject(new Error('API not initialized')),
    fetchUserProfile: (username) => apiInstance ? apiInstance.fetchUserProfile(username) : Promise.reject(new Error('API not initialized')),
    fetchUserProgress: (username, gameId) => apiInstance ? apiInstance.fetchUserProgress(username, gameId) : Promise.reject(new Error('API not initialized')),
    fetchGameInfo: (gameId) => apiInstance ? apiInstance.fetchGameInfo(gameId) : Promise.reject(new Error('API not initialized')),
    api: apiInstance
};

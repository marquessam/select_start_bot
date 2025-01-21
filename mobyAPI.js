// mobyAPI.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const ErrorHandler = require('./utils/errorHandler');

class APIRateLimiter {
    constructor() {
        this.lastRequest = 0;
        this.minDelay = 1000; // 1 second minimum between requests
        this.queue = [];
        this.processing = false;
    }

    async makeRequest(url) {
        return new Promise((resolve, reject) => {
            this.queue.push({ url, resolve, reject });
            if (!this.processing) this.processQueue();
        });
    }

    async processQueue() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        try {
            while (this.queue.length > 0) {
                const { url, resolve, reject } = this.queue[0];
                
                const now = Date.now();
                const timeToWait = Math.max(0, this.lastRequest + this.minDelay - now);
                
                if (timeToWait > 0) {
                    await new Promise(r => setTimeout(r, timeToWait));
                }

                try {
                    const response = await fetch(url);
                    this.lastRequest = Date.now();

                    if (!response.ok) {
                        throw new Error(`MobyGames API Error: ${response.statusText}`);
                    }

                    const data = await response.json();
                    resolve(data);
                } catch (error) {
                    reject(error);
                }

                this.queue.shift();
                await new Promise(r => setTimeout(r, this.minDelay));
            }
        } finally {
            this.processing = false;
        }
    }
}

class MobyAPI {
    constructor() {
        this.baseUrl = process.env.MOBYGAMES_API_URL || 'https://api.mobygames.com/v1';
        this.apiKey = process.env.MOBYGAMES_API_KEY;
        
        // Initialize rate limiter
        this.rateLimiter = new APIRateLimiter();

        // Cache setup with TTL values
        this.cache = {
            games: new Map(),
            platforms: new Map(),
            boxArt: new Map(),
            thisDay: new Map(),
            lastCleanup: Date.now()
        };

        // TTL configuration (in milliseconds)
        this.ttl = {
            games: 12 * 60 * 60 * 1000,     // 12 hours
            platforms: 24 * 60 * 60 * 1000,  // 24 hours
            boxArt: 7 * 24 * 60 * 60 * 1000, // 7 days
            thisDay: 24 * 60 * 60 * 1000,    // 24 hours
            cleanupInterval: 60 * 60 * 1000   // 1 hour
        };
    }

    async _makeRequest(endpoint, params = {}) {
        try {
            // Add API key to params
            params.api_key = this.apiKey;
            
            // Build URL with parameters
            const url = new URL(`${this.baseUrl}${endpoint}`);
            Object.entries(params).forEach(([key, value]) => 
                url.searchParams.append(key, value)
            );

            return await this.rateLimiter.makeRequest(url.toString());
        } catch (error) {
            ErrorHandler.logError(error, 'MobyGames API Request');
            throw error;
        }
    }

    // Cache management methods
    _shouldCleanCache() {
        return Date.now() - this.cache.lastCleanup > this.ttl.cleanupInterval;
    }

    _cleanCache() {
        const now = Date.now();
        
        Object.entries(this.cache).forEach(([key, cache]) => {
            if (cache instanceof Map) {
                for (const [entryKey, entry] of cache) {
                    if (now - entry.timestamp > this.ttl[key]) {
                        cache.delete(entryKey);
                    }
                }
            }
        });

        this.cache.lastCleanup = now;
        console.log('[MOBY API] Cache cleaned');
    }

    async searchGames(query, exact = false) {
        try {
            // Clean cache if needed
            if (this._shouldCleanCache()) {
                this._cleanCache();
            }

            const cacheKey = `search:${query}:${exact}`;
            const cached = this.cache.games.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp < this.ttl.games)) {
                console.log('[MOBY API] Returning cached search results for:', query);
                return cached.data;
            }

            console.log('[MOBY API] Fetching new search results for:', query);
            const data = await this._makeRequest('/games', {
                title: query,
                format: 'normal'
            });

            // If exact match requested, filter results
            if (exact) {
                data.games = data.games.filter(game => 
                    game.title.toLowerCase() === query.toLowerCase()
                );
            }

            // Cache the results
            this.cache.games.set(cacheKey, {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            ErrorHandler.logError(error, 'Game Search');
            return { games: [] };
        }
    }

    async getGameDetails(gameId) {
        try {
            const cached = this.cache.games.get(gameId);
            if (cached && (Date.now() - cached.timestamp < this.ttl.games)) {
                return cached.data;
            }

            const data = await this._makeRequest(`/games/${gameId}`);

            this.cache.games.set(gameId, {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            ErrorHandler.logError(error, 'Game Details');
            return null;
        }
    }

    async getGameArtwork(gameId) {
        try {
            const cacheKey = `artwork:${gameId}`;
            const cached = this.cache.boxArt.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp < this.ttl.boxArt)) {
                return cached.data;
            }

            const data = await this._makeRequest(`/games/${gameId}/platforms`);

            this.cache.boxArt.set(cacheKey, {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            ErrorHandler.logError(error, 'Game Artwork');
            return null;
        }
    }

    async getPlatforms() {
        try {
            // Return cached platforms if available and not expired
            const firstEntry = this.cache.platforms.values().next().value;
            if (firstEntry && (Date.now() - firstEntry.timestamp < this.ttl.platforms)) {
                return Array.from(this.cache.platforms.values())
                    .map(entry => entry.data);
            }

            const data = await this._makeRequest('/platforms');
            
            // Cache each platform
            data.platforms.forEach(platform => {
                this.cache.platforms.set(platform.platform_id, {
                    data: platform,
                    timestamp: Date.now()
                });
            });

            return data.platforms;
        } catch (error) {
            ErrorHandler.logError(error, 'Platforms');
            return [];
        }
    }

    async getThisDay() {
        try {
            const today = new Date();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const cacheKey = `thisday:${month}-${day}`;

            const cached = this.cache.thisDay.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < this.ttl.thisDay)) {
                return cached.data;
            }

            const data = await this._makeRequest('/games', {
                release_month: month,
                release_day: day
            });

            // Validate and normalize the response
            if (!data || !Array.isArray(data.games)) {
                throw new Error('API response does not contain a valid games array');
            }

            const validGames = data.games
                .filter(game => game.first_release_date && game.title)
                .map(game => ({
                    first_release_date: game.first_release_date,
                    title: game.title,
                    platforms: game.platforms || [{ platform_name: 'Unknown Platform' }]
                }));

            const result = { games: validGames };

            this.cache.thisDay.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            ErrorHandler.logError(error, 'This Day in Gaming');
            return { games: [] };
        }
    }

    clearCache() {
        Object.values(this.cache).forEach(cache => {
            if (cache instanceof Map) {
                cache.clear();
            }
        });
        this.cache.lastCleanup = Date.now();
        console.log('[MOBY API] Cache cleared');
    }
}

// Export a singleton instance
module.exports = new MobyAPI();

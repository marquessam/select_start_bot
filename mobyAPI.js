import pkg from 'node-fetch';
const fetch = pkg.default;
import ErrorHandler from './utils/errorHandler.js';

class MobyAPI {
    constructor() {
        this.baseUrl = process.env.MOBYGAMES_API_URL;
        this.apiKey = process.env.MOBYGAMES_API_KEY;
        
        // Cache setup
        this.cache = {
            games: new Map(),
            platforms: new Map(),
            companies: new Map(),
            lastUpdate: null,
            updateInterval: 12 * 60 * 60 * 1000 // 12 hours
        };

        // Rate limiting
        this.rateLimiter = {
            lastRequest: 0,
            minDelay: 1000 // 1 second between requests
        };
    }

    async _makeRequest(endpoint, params = {}) {
        try {
            // Rate limiting
            const now = Date.now();
            const timeSinceLastRequest = now - this.rateLimiter.lastRequest;
            if (timeSinceLastRequest < this.rateLimiter.minDelay) {
                await new Promise(resolve => 
                    setTimeout(resolve, this.rateLimiter.minDelay - timeSinceLastRequest)
                );
            }

            // Add API key to params
            params.api_key = this.apiKey;
            
            // Build URL with parameters
            const url = new URL(`${this.baseUrl}${endpoint}`);
            Object.keys(params).forEach(key => 
                url.searchParams.append(key, params[key])
            );

            const response = await fetch(url.toString());
            this.rateLimiter.lastRequest = Date.now();

            if (!response.ok) {
                throw new Error(`MobyGames API Error: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            ErrorHandler.logError(error, 'MobyGames API Request');
            throw error;
        }
    }

    async searchGames(query) {
        try {
            // Check cache first
            const cacheKey = `search:${query}`;
            if (this.cache.games.has(cacheKey)) {
                const cached = this.cache.games.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cache.updateInterval) {
                    return cached.data;
                }
            }

            const data = await this._makeRequest('/games', {
                title: query,
                format: 'normal'
            });

            // Cache the results
            this.cache.games.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            ErrorHandler.logError(error, 'Game Search');
            throw error;
        }
    }

    async getGameDetails(gameId) {
        try {
            // Check cache first
            if (this.cache.games.has(gameId)) {
                const cached = this.cache.games.get(gameId);
                if (Date.now() - cached.timestamp < this.cache.updateInterval) {
                    return cached.data;
                }
            }

            const data = await this._makeRequest(`/games/${gameId}`);

            // Cache the results
            this.cache.games.set(gameId, {
                data: data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            ErrorHandler.logError(error, 'Game Details');
            throw error;
        }
    }

    async getGameArtwork(gameId) {
        try {
            const cacheKey = `artwork:${gameId}`;
            if (this.cache.games.has(cacheKey)) {
                const cached = this.cache.games.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cache.updateInterval) {
                    return cached.data;
                }
            }

            const data = await this._makeRequest(`/games/${gameId}/platforms`);

            // Cache the results
            this.cache.games.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            ErrorHandler.logError(error, 'Game Artwork');
            throw error;
        }
    }

    async getPlatforms() {
        try {
            if (this.cache.platforms.size > 0) {
                const firstEntry = this.cache.platforms.values().next().value;
                if (Date.now() - firstEntry.timestamp < this.cache.updateInterval) {
                    return Array.from(this.cache.platforms.values())
                        .map(entry => entry.data);
                }
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
            throw error;
        }
    }

    async getThisDay() {
        try {
            const today = new Date();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');

            // Check cache
            const cacheKey = `thisday:${month}-${day}`;
            if (this.cache.games.has(cacheKey)) {
                const cached = this.cache.games.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cache.updateInterval) {
                    return cached.data;
                }
            }

            // Fetch data from API
            const data = await this._makeRequest('/games', {
                release_month: month,
                release_day: day
            });

            console.log('Raw API Response:', JSON.stringify(data, null, 2)); // Debug log

            // Validate the response
            if (!data || !Array.isArray(data.games)) {
                throw new Error('API response does not contain a valid games array');
            }

            // Normalize and validate game data
            const validGames = data.games.filter(game =>
                game.first_release_date && game.title && Array.isArray(game.platforms)
            ).map(game => ({
                first_release_date: game.first_release_date,
                title: game.title,
                platforms: game.platforms || [{ platform_name: 'Unknown Platform' }]
            }));

            const result = { games: validGames };

            // Cache the results
            this.cache.games.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });

            return result;
        } catch (error) {
            ErrorHandler.logError(error, 'This Day in Gaming');
            throw error;
        }
    }

    clearCache() {
        this.cache.games.clear();
        this.cache.platforms.clear();
        this.cache.companies.clear();
        this.cache.lastUpdate = null;
    }
}

export default new MobyAPI();

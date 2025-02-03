// raAPI.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const ErrorHandler = require('./utils/errorHandler');

// Rate limiter setup
const rateLimiter = {
    requests: new Map(),
    cooldown: 1250, // Slightly increased cooldown to prevent rate limits
    queue: [],
    processing: false,

    async processQueue() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        while (this.queue.length > 0) {
            const { url, resolve, reject, retries } = this.queue.shift();

            try {
                const now = Date.now();
                const lastRequest = this.requests.get(url) || 0;
                const timeSinceLast = now - lastRequest;

                if (timeSinceLast < this.cooldown) {
                    await new Promise(resolve => setTimeout(resolve, this.cooldown - timeSinceLast));
                }

                const response = await fetch(url, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${Buffer.from(`${process.env.RA_USERNAME}:${process.env.RA_API_KEY}`).toString('base64')}`
                    }
                });

                this.requests.set(url, Date.now());

                if (!response.ok) {
                    if (response.status === 429 && retries < 3) {
                        console.warn(`[RA API] Rate limit hit. Retrying in ${(this.cooldown * 2) / 1000} sec...`);
                        await new Promise(resolve => setTimeout(resolve, this.cooldown * 2));
                        this.queue.push({ url, resolve, reject, retries: retries + 1 });
                        continue;
                    }
                    throw new Error(`Failed to fetch: ${response.statusText}`);
                }

                const data = await response.json();
                resolve(data);
            } catch (error) {
                reject(error);
            }
        }
        this.processing = false;
    },

    async makeRequest(url) {
        return new Promise((resolve, reject) => {
            this.queue.push({ url, resolve, reject, retries: 0 });
            this.processQueue();
        });
    }
};

// Cache setup
const cache = {
    userProfiles: new Map(),
    gameProgress: new Map(),
    cacheTimeout: 5 * 60 * 1000 // 5 minutes
};

class RetroAchievementsAPI {
    constructor() {
        this.baseUrl = 'https://retroachievements.org/API';
    }

    async fetchUserProfile(username) {
        const cacheKey = `profile-${username.toLowerCase()}`;
        const cachedData = cache.userProfiles.get(cacheKey);
        
        if (cachedData && (Date.now() - cachedData.timestamp < cache.cacheTimeout)) {
            return cachedData.data;
        }

        try {
            const url = `${this.baseUrl}/API_GetUserSummary.php?z=${process.env.RA_USERNAME}&y=${process.env.RA_API_KEY}&u=${username}`;
            const response = await rateLimiter.makeRequest(url);

            if (!response || !response.UserPic) return null;

            const profileUrl = `https://retroachievements.org${response.UserPic}`;
            cache.userProfiles.set(cacheKey, {
                data: profileUrl,
                timestamp: Date.now()
            });

            return profileUrl;
        } catch (error) {
            console.error(`[RA API] Error fetching user profile for ${username}:`, error);
            return null;
        }
    }

    async fetchCompleteGameProgress(username, gameId) {
        const cacheKey = `progress-${username.toLowerCase()}-${gameId}`;
        const cachedData = cache.gameProgress.get(cacheKey);
        
        if (cachedData && (Date.now() - cachedData.timestamp < cache.cacheTimeout)) {
            return cachedData.data;
        }

        try {
            const url = `${this.baseUrl}/API_GetGameInfoAndUserProgress.php?z=${process.env.RA_USERNAME}&y=${process.env.RA_API_KEY}&g=${gameId}&u=${username}`;
            const response = await rateLimiter.makeRequest(url);

            if (!response) {
                throw new Error('No response from RA API');
            }

            // Process the response into our needed format
            const processedData = {
                gameId: response.ID,
                title: response.Title,
                numAchievements: response.NumAchievements,
                numAwardedToUser: response.NumAwardedToUser,
                numAwardedToUserHardcore: response.NumAwardedToUserHardcore,
                userCompletion: response.UserCompletion,
                userCompletionHardcore: response.UserCompletionHardcore,
                highestAwardKind: this.determineHighestAward(response),
                achievements: response.Achievements || {}
            };

            cache.gameProgress.set(cacheKey, {
                data: processedData,
                timestamp: Date.now()
            });

            return processedData;
        } catch (error) {
            console.error(`[RA API] Error fetching game progress for ${username}, game ${gameId}:`, error);
            return null;
        }
    }

    determineHighestAward(gameData) {
        if (!gameData.Achievements || Object.keys(gameData.Achievements).length === 0) {
            return null;
        }

        // Check if all achievements are completed
        const totalAchievements = Object.keys(gameData.Achievements).length;
        const completedAchievements = Object.values(gameData.Achievements)
            .filter(ach => ach.DateEarned).length;

        if (totalAchievements === completedAchievements) {
            return 'mastered';
        }

        // Check for beaten status (at least one win condition achievement)
        const hasBeatenAchievement = Object.values(gameData.Achievements)
            .some(ach => ach.DateEarned && ach.type === 'progression');

        if (hasBeatenAchievement) {
            return 'beaten';
        }

        // If any achievements earned, consider it participation
        if (completedAchievements > 0) {
            return 'participation';
        }

        return null;
    }

    async fetchAllRecentAchievements() {
        try {
            console.log('[RA API] Fetching ALL recent achievements...');

            const validUsers = await this.getValidUsers();
            if (!Array.isArray(validUsers) || validUsers.length === 0) {
                console.warn('[RA API] No valid users found, returning empty achievements list.');
                return [];
            }

            const allAchievements = [];
            const CHUNK_SIZE = 1;
            const CHUNK_DELAY_MS = 1500;

            for (let i = 0; i < validUsers.length; i += CHUNK_SIZE) {
                const chunk = validUsers.slice(i, i + CHUNK_SIZE);

                const chunkPromises = chunk.map(async username => {
                    try {
                        const url = `${this.baseUrl}/API_GetUserRecentAchievements.php?z=${process.env.RA_USERNAME}&y=${process.env.RA_API_KEY}&u=${username}&c=50`;
                        const recentData = await rateLimiter.makeRequest(url);

                        return { 
                            username, 
                            achievements: Array.isArray(recentData) ? recentData : [] 
                        };
                    } catch (error) {
                        console.error(`[RA API] Error fetching achievements for ${username}:`, error);
                        return { username, achievements: [] };
                    }
                });

                const chunkResults = await Promise.all(chunkPromises);
                allAchievements.push(...chunkResults);

                if (i + CHUNK_SIZE < validUsers.length) {
                    await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));
                }
            }

            return allAchievements;
        } catch (error) {
            console.error('[RA API] Error in fetchAllRecentAchievements:', error);
            return [];
        }
    }

    async getValidUsers() {
        // This should be implemented to get users from your database
        // For now, returning an empty array as placeholder
        return [];
    }
}

module.exports = new RetroAchievementsAPI();

// raAPI.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const ErrorHandler = require('./utils/errorHandler');

// Rate limiting setup with more conservative values
const rateLimiter = {
    requests: new Map(),
    cooldown: 2500, // 2.5 seconds between requests
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
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    if (response.status === 429 && retries < 3) {
                        console.warn(`[RA API] Rate limit hit. Waiting ${this.cooldown * 2}ms...`);
                        await new Promise(resolve => setTimeout(resolve, this.cooldown * 2));
                        this.queue.push({ url, resolve, reject, retries: retries + 1 });
                        continue;
                    }
                    throw new Error(`Failed to fetch: ${response.statusText}`);
                }

                const data = await response.json();
                this.requests.set(url, Date.now());
                resolve(data);

                // Add delay after successful request
                await new Promise(resolve => setTimeout(resolve, this.cooldown));

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

class RetroAchievementsAPI {
    constructor() {
        this.baseUrl = 'https://retroachievements.org/API';
        this.validUsers = null;
        this.database = null;
    }

    setDatabase(database) {
        this.database = database;
    }

    async getValidUsers() {
        if (!this.database) {
            console.error('[RA API] Database not initialized');
            return [];
        }
        if (!this.validUsers) {
            this.validUsers = await this.database.getValidUsers();
        }
        return this.validUsers;
    }

    async fetchUserProfile(username) {
        try {
            const url = `${this.baseUrl}/API_GetUserSummary.php?z=${process.env.RA_USERNAME}&y=${process.env.RA_API_KEY}&u=${username}`;
            const response = await rateLimiter.makeRequest(url);

            if (!response || !response.UserPic) return null;
            return `https://retroachievements.org${response.UserPic}`;
        } catch (error) {
            console.error(`[RA API] Error fetching user profile for ${username}:`, error);
            return null;
        }
    }

    async fetchCompleteGameProgress(username, gameId) {
    try {
        const url = `${this.baseUrl}/API_GetGameInfoAndUserProgress.php?z=${process.env.RA_USERNAME}&y=${process.env.RA_API_KEY}&g=${gameId}&u=${username}`;
        const response = await rateLimiter.makeRequest(url);

        if (!response) {
            throw new Error('No response from RA API');
        }

        // Process the response to determine highest award
        let highestAwardKind = null;
        const totalAchievements = parseInt(response.NumAchievements) || 0;
        const awardedAchievements = parseInt(response.NumAwardedToUser) || 0;

        if (totalAchievements > 0) {
            if (totalAchievements === awardedAchievements) {
                highestAwardKind = 'mastered';
            } else {
                // Check for progression achievements
                const hasBeatenAchievement = Object.values(response.Achievements || {})
                    .some(ach => ach.DateEarned && ach.Type === 3); // Type 3 is progression
                
                if (hasBeatenAchievement) {
                    highestAwardKind = 'beaten';
                } else if (awardedAchievements > 0) {
                    highestAwardKind = 'participation';
                }
            }
        }

        return {
            gameId: response.ID,
            title: response.Title,
            numAchievements: totalAchievements,
            numAwardedToUser: awardedAchievements,
            userCompletion: response.UserCompletion,
            highestAwardKind,
            achievements: response.Achievements || {}
        };
    } catch (error) {
        console.error(`[RA API] Error fetching game progress for ${username}, game ${gameId}:`, error);
        return null;
    }
}
    async fetchAllRecentAchievements() {
        try {
            const validUsers = await this.getValidUsers();
            if (!validUsers || validUsers.length === 0) {
                console.warn('[RA API] No valid users found');
                return [];
            }

            console.log(`[RA API] Fetching recent achievements for ${validUsers.length} users...`);
            const allAchievements = [];

            // Process users one at a time with delay
            for (const username of validUsers) {
                try {
                    const url = `${this.baseUrl}/API_GetUserRecentAchievements.php?z=${process.env.RA_USERNAME}&y=${process.env.RA_API_KEY}&u=${username}&c=50`;
                    const recentData = await rateLimiter.makeRequest(url);

                    if (Array.isArray(recentData) && recentData.length > 0) {
                        allAchievements.push({
                            username,
                            achievements: recentData
                        });
                    }

                    // Extra delay between users
                    await new Promise(resolve => setTimeout(resolve, 2500));
                } catch (error) {
                    console.error(`[RA API] Error fetching achievements for ${username}:`, error);
                }
            }

            return allAchievements;
        } catch (error) {
            console.error('[RA API] Error in fetchAllRecentAchievements:', error);
            return [];
        }
    }
}

// Create and export a singleton instance
const raAPI = new RetroAchievementsAPI();
module.exports = raAPI;

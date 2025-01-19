// raAPI.js

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const database = require('./database');

/**
 * Rate limiter object (same as before).
 * Ensures we don't spam RA's API too fast.
 */
const rateLimiter = {
    requests: new Map(),
    cooldown: 1000, // 1 second between requests
    queue: [],
    processing: false,

    async processQueue() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        while (this.queue.length > 0) {
            const { url, resolve, reject } = this.queue[0];

            try {
                const now = Date.now();
                const lastRequest = this.requests.get(url) || 0;
                const timeToWait = Math.max(0, lastRequest + this.cooldown - now);

                if (timeToWait > 0) {
                    await new Promise(r => setTimeout(r, timeToWait));
                }

                const response = await fetch(url);
                this.requests.set(url, Date.now());

                if (!response.ok) {
                    throw new Error(`Failed to fetch: ${response.statusText}`);
                }

                const data = await response.json();
                resolve(data);
            } catch (error) {
                reject(error);
            }

            this.queue.shift();
            await new Promise(r => setTimeout(r, this.cooldown));
        }
        this.processing = false;
    },

    async makeRequest(url) {
        return new Promise((resolve, reject) => {
            this.queue.push({ url, resolve, reject });
            this.processQueue();
        });
    }
};

/**
 * Simple in-memory cache if desired (optional).
 */
const cache = {
    // For user profiles, if you want
    userProfiles: new Map(),
    leaderboardData: null,
    profileTTL: 3600000, // 1 hour
    leaderboardTTL: 300000, // 5 minutes
    lastLeaderboardUpdate: 0
};

/**
 * Fetches a user's entire RetroAchievements profile (which includes
 * all games they've played and achievements earned).
 *
 * Endpoint: API_GetUserSummary.php
 *
 * Returns JSON with a structure like:
 * {
 *   "Username": "SomeUser",
 *   "Games": {
 *     "319": { "GameID": "319", "Achievements": { "2080": {...}, ... } },
 *     "10024": { "GameID": "10024", ... },
 *     ...
 *   }
 * }
 */
async function fetchUserSummary(username) {
    try {
        const params = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            u: username
        });
        const url = `https://retroachievements.org/API/API_GetUserSummary.php?${params}`;

        const data = await rateLimiter.makeRequest(url);
        // data.Games => object of gameId -> game info

        // Return this whole JSON so we can parse it later
        return data;
    } catch (error) {
        console.error(`[RA API] Error fetching user summary for ${username}:`, error);
        // Return partial fallback
        return {
            Username: username,
            Games: {}
        };
    }
}

/**
 * For the main scoreboard (monthly/yearly):
 * We fetch each user's entire summary once, parse out how many
 * achievements they've completed in the "current challenge" game
 * (plus we store all achievements for monthlyGames usage).
 */
async function fetchLeaderboardData() {
    try {
        // Check if we have recent data in memory cache
        if (cache.leaderboardData && Date.now() - cache.lastLeaderboardUpdate < cache.leaderboardTTL) {
            console.log('[RA API] Returning cached leaderboard data');
            return cache.leaderboardData;
        }

        console.log('[RA API] Fetching fresh leaderboard data via getUserSummary for each user');

        // Get the current challenge from DB (the main scoreboard game)
        const challenge = await database.getCurrentChallenge();
        if (!challenge || !challenge.gameId) {
            throw new Error('No active challenge found in database');
        }

        // Gather valid users
        const validUsers = await database.getValidUsers();
        console.log(`[RA API] Fetching data for ${validUsers.length} users`);

        const usersProgress = [];

        for (const username of validUsers) {
            try {
                // 1) Full summary for the user
                const userSummary = await fetchUserSummary(username);

                // 2) Build a flat array of achievements if you want user.achievements
                let allAchievements = [];
                if (userSummary.Games) {
                    for (const [gId, gData] of Object.entries(userSummary.Games)) {
                        if (gData && gData.Achievements) {
                            const achList = Object.values(gData.Achievements);
                            allAchievements.push(...achList);
                        }
                    }
                }

                // 3) For scoreboard, compute stats for the main challenge game
                let totalAchievements = 0;
                let completedAchievements = 0;
                let completionPercentage = '0.00';
                let hasBeatenGame = false;

                // If user has data for that challenge's gameId
                const gameIdStr = challenge.gameId.toString(); // for parseInt comparison
                const mainGameData = userSummary.Games?.[gameIdStr]; 
                if (mainGameData && mainGameData.Achievements) {
                    const mainAchArray = Object.values(mainGameData.Achievements);
                    totalAchievements = mainAchArray.length;
                    completedAchievements = mainAchArray.filter(a => parseInt(a.DateEarned, 10) > 0).length;
                    
                    completionPercentage = (totalAchievements > 0) 
                        ? ((completedAchievements / totalAchievements) * 100).toFixed(2)
                        : '0.00';

                    // Check "beaten" if (ach.Flags & 2) === 2 in any
                    hasBeatenGame = mainAchArray.some(ach => {
                        const isWinCondition = (ach.Flags & 2) === 2;
                        const isEarned = parseInt(ach.DateEarned, 10) > 0;
                        return isWinCondition && isEarned;
                    });
                }

                usersProgress.push({
                    username,
                    completedAchievements,
                    totalAchievements,
                    completionPercentage,
                    hasBeatenGame,
                    achievements: allAchievements
                    // optionally add: userSummary => if you want more data
                });

                console.log(`[RA API] Fetched summary for ${username}: ${completedAchievements}/${totalAchievements} (main challenge)`);
            } catch (error) {
                console.error(`[RA API] Error building data for ${username}:`, error);
                usersProgress.push({
                    username,
                    completedAchievements: 0,
                    totalAchievements: 0,
                    completionPercentage: '0.00',
                    hasBeatenGame: false,
                    achievements: []
                });
            }
        }

        // Sort the final scoreboard by completion %
        usersProgress.sort((a,b) => parseFloat(b.completionPercentage) - parseFloat(a.completionPercentage));

        // Build final result
        const leaderboardData = {
            leaderboard: usersProgress,
            gameInfo: challenge,
            lastUpdated: new Date().toISOString()
        };

        // Cache result
        cache.leaderboardData = leaderboardData;
        cache.lastLeaderboardUpdate = Date.now();

        console.log(`[RA API] Leaderboard data updated with ${usersProgress.length} users`);
        return leaderboardData;

    } catch (error) {
        console.error('[RA API] Error in fetchLeaderboardData:', error);
        throw error;
    }
}

/**
 * Existing method to fetch each user's recent achievements (last 50).
 * Primarily used for real-time feed announcements if needed.
 */
async function fetchAllRecentAchievements() {
    try {
        console.log('[RA API] Fetching ALL recent achievements for each user...');

        const validUsers = await database.getValidUsers();
        const allRecentAchievements = [];

        for (const username of validUsers) {
            try {
                const params = new URLSearchParams({
                    z: process.env.RA_USERNAME,
                    y: process.env.RA_API_KEY,
                    u: username,
                    c: 50
                });

                const url = `https://retroachievements.org/API/API_GetUserRecentAchievements.php?${params}`;
                const recentData = await rateLimiter.makeRequest(url);

                allRecentAchievements.push({
                    username,
                    achievements: recentData || []
                });

                console.log(`[RA API] Fetched recent achievements for user: ${username}`);
            } catch (error) {
                console.error(`[RA API] Error fetching recent achievements for ${username}:`, error);
                allRecentAchievements.push({
                    username,
                    achievements: []
                });
            }
        }

        return allRecentAchievements;
    } catch (error) {
        console.error('[RA API] Error in fetchAllRecentAchievements:', error);
        throw error;
    }
}

module.exports = {
    fetchLeaderboardData,
    fetchAllRecentAchievements,
    // optional: export fetchUserSummary if you want to call it directly
    fetchUserSummary
};

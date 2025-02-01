const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const database = require('./database');
const { ErrorHandler } = require('./utils/errorHandler');

// ---------------------------------------
// Helper to delay execution without blocking
// ---------------------------------------
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------
// Rate limiting setup
// ---------------------------------------
const rateLimiter = {
    requests: new Map(),
    cooldown: 1000, // 1 second between requests
    queue: [],
    processing: false,

    async processQueue() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        while (this.queue.length > 0) {
            const { url, resolve, reject } = this.queue.shift();

            try {
                const now = Date.now();
                const lastRequest = this.requests.get(url) || 0;
                const timeSinceLast = now - lastRequest;

                const timeToWait = Math.max(0, this.cooldown - timeSinceLast);
                if (timeToWait > 0) {
                    await delay(timeToWait);
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

// ---------------------------------------
// Fetch User Profile (✅ FIXED)
// ---------------------------------------
async function fetchUserProfile(username) {
    try {
        const params = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            u: username
        });

        const url = `https://retroachievements.org/API/API_GetUserSummary.php?${params}`;
        const response = await rateLimiter.makeRequest(url);

        if (!response || !response.UserPic) return null;
        return `https://retroachievements.org${response.UserPic}`;
    } catch (error) {
        console.error(`[RA API] Error fetching user profile for ${username}:`, error);
        return null;
    }
}

// ---------------------------------------
// Fetch Leaderboard Data
// ---------------------------------------
async function fetchLeaderboardData(force = false) {
    try {
        console.log('[RA API] Fetching leaderboard data...');

        const challenge = await database.getCurrentChallenge();
        if (!challenge || !challenge.gameId) {
            throw new Error('[RA API] No active challenge found in database');
        }

        const validUsers = await database.getValidUsers();
        console.log(`[RA API] Tracking games for ${validUsers.length} users.`);

        const userProgressData = await batchFetchUserProgress(validUsers, ['355', '274', '319']);

        const usersProgress = [];
        for (const username of validUsers) {
            try {
                const userEntries = userProgressData.filter(p => p.username === username);
                let allGameAchievements = [];

                for (const entry of userEntries) {
                    if (entry.data?.Achievements) {
                        const gameAchievements = Object.values(entry.data.Achievements).map(ach => ({
                            ...ach,
                            GameID: entry.gameId
                        }));
                        allGameAchievements.push(...gameAchievements);
                    }
                }

                const mainGameAchievements = allGameAchievements.filter(a => a.GameID === '355');
                const numAchievements = mainGameAchievements.length;
                const completed = mainGameAchievements.filter(ach => parseInt(ach.DateEarned, 10) > 0).length;

                const hasBeatenGame = mainGameAchievements.some(ach => {
                    const isWinCondition = (ach.Flags & 2) === 2;
                    const isEarned = parseInt(ach.DateEarned, 10) > 0;
                    return isWinCondition && isEarned;
                });

                usersProgress.push({
                    username,
                    profileImage: `https://retroachievements.org/UserPic/${username}.png`,
                    profileUrl: `https://retroachievements.org/user/${username}`,
                    completedAchievements: completed,
                    totalAchievements: numAchievements,
                    completionPercentage: numAchievements > 0 ? ((completed / numAchievements) * 100).toFixed(2) : '0.00',
                    hasBeatenGame: !!hasBeatenGame,
                    achievements: allGameAchievements
                });

                console.log(`[RA API] Processed achievements for ${username}: ${completed}/${numAchievements} achievements.`);
            } catch (error) {
                console.error(`[RA API] Error processing data for ${username}:`, error);
            }
        }

        return {
            leaderboard: usersProgress.sort((a, b) => parseFloat(b.completionPercentage) - parseFloat(a.completionPercentage)),
            gameInfo: challenge,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error('[RA API] Error fetching leaderboard data:', error);
        throw error;
    }
}

// ---------------------------------------
// Fetch User Progress for Multiple Games
// ---------------------------------------
async function batchFetchUserProgress(usernames, gameIds) {
    const fetchResults = [];
    const CHUNK_SIZE = 2;
    const CHUNK_DELAY_MS = 1000;

    for (let i = 0; i < usernames.length; i += CHUNK_SIZE) {
        const chunk = usernames.slice(i, i + CHUNK_SIZE);

        const chunkPromises = chunk.flatMap(username => {
            return gameIds.map(gameId => {
                const params = new URLSearchParams({
                    z: process.env.RA_USERNAME,
                    y: process.env.RA_API_KEY,
                    g: gameId,
                    u: username
                });
                const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;

                return rateLimiter.makeRequest(url)
                    .then(data => ({ username, gameId, data }))
                    .catch(error => {
                        console.error(`[RA API] Error fetching progress for ${username}, game ${gameId}:`, error);
                        return { username, gameId, data: null };
                    });
            });
        });

        const chunkResults = await Promise.all(chunkPromises);
        fetchResults.push(...chunkResults);

        if (i + CHUNK_SIZE < usernames.length) {
            await delay(CHUNK_DELAY_MS);
        }
    }

    return fetchResults;
}

// ---------------------------------------
// Fetch All Recent Achievements
// ---------------------------------------
async function fetchAllRecentAchievements() {
    try {
        console.log('[RA API] Fetching ALL recent achievements...');

        const validUsers = await database.getValidUsers();
        const allAchievements = [];
        const CHUNK_SIZE = 2;
        const CHUNK_DELAY_MS = 1000;

        for (let i = 0; i < validUsers.length; i += CHUNK_SIZE) {
            const chunk = validUsers.slice(i, i + CHUNK_SIZE);

            const chunkPromises = chunk.map(async username => {
                try {
                    const params = new URLSearchParams({
                        z: process.env.RA_USERNAME,
                        y: process.env.RA_API_KEY,
                        u: username,
                        c: 50
                    });

                    const url = `https://retroachievements.org/API/API_GetUserRecentAchievements.php?${params}`;
                    const recentData = await rateLimiter.makeRequest(url);

                    return { username, achievements: Array.isArray(recentData) ? recentData : [] };
                } catch (error) {
                    console.error(`[RA API] Error fetching achievements for ${username}:`, error);
                    return { username, achievements: [] };
                }
            });

            const chunkResults = await Promise.all(chunkPromises);
            allAchievements.push(...chunkResults);

            if (i + CHUNK_SIZE < validUsers.length) {
                await delay(CHUNK_DELAY_MS);
            }
        }

        return allAchievements;
    } catch (error) {
        console.error('[RA API] Error in fetchAllRecentAchievements:', error);
        throw error;
    }
}

module.exports = {
    fetchLeaderboardData,
    fetchAllRecentAchievements,
    fetchUserProfile // ✅ Added to exports
};

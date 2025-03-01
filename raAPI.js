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

                const timeToWait = Math.max(0, this.cooldown - timeSinceLast);
                if (timeToWait > 0) {
                    await delay(timeToWait);
                }

                const response = await fetch(url);
                this.requests.set(url, Date.now());

                if (!response.ok) {
                    if (response.status === 429 && retries < 3) { // Rate limit hit, retry with backoff
                        console.warn(`[RA API] Rate limit hit. Retrying in ${(this.cooldown * 2) / 1000} sec...`);
                        await delay(this.cooldown * 2);
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

// ---------------------------------------
// Caching Setup
// ---------------------------------------
const cache = {
    leaderboard: null,
    leaderboardTimestamp: 0,
    userProfiles: new Map()
};

// ---------------------------------------
// Fetch User Profile (Optimized with Cache)
// ---------------------------------------
async function fetchUserProfile(username) {
    if (cache.userProfiles.has(username)) {
        return cache.userProfiles.get(username);
    }

    try {
        const params = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            u: username
        });

        const url = `https://retroachievements.org/API/API_GetUserSummary.php?${params}`;
        const response = await rateLimiter.makeRequest(url);

        if (!response || !response.UserPic) return null;

        const profileUrl = `https://retroachievements.org${response.UserPic}`;
        cache.userProfiles.set(username, profileUrl);
        return profileUrl;
    } catch (error) {
        console.error(`[RA API] Error fetching user profile for ${username}:`, error);
        return null;
    }
}

// ---------------------------------------
// Fetch Leaderboard Data (Caching Added)
// ---------------------------------------
async function fetchLeaderboardData(force = false) {
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    if (!force && cache.leaderboard && (Date.now() - cache.leaderboardTimestamp) < CACHE_DURATION) {
        return cache.leaderboard;
    }

    try {
        console.log('[RA API] Fetching leaderboard data...');

        const challenge = await database.getCurrentChallenge();
        if (!challenge || !challenge.gameId) {
            throw new Error('[RA API] No active challenge found in database');
        }

        const validUsers = await database.getValidUsers();
        console.log(`[RA API] Tracking games for ${validUsers.length} users.`);

        // Make sure Mega Man X5 is the first game in the array for March
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        const isMarchChallenge = month === 3 && year === 2025;
        
        // Include all tracked games but prioritize the current month's games
        const trackedGames = isMarchChallenge 
            ? ['113355', '7181', '355', '274', '319', '10024'] 
            : ['355', '274', '319', '10024', '113355', '7181'];

        const userProgressData = await batchFetchUserProgress(validUsers, trackedGames);

        const usersProgress = validUsers.map(username => {
            const userEntries = userProgressData.filter(p => p.username === username);
            let allGameAchievements = [];

            for (const entry of userEntries) {
                if (entry.data?.Achievements) {
                    const gameAchievements = Object.values(entry.data.Achievements).map(ach => ({
                        ...ach,
                        GameID: entry.gameId,
                        GameTitle: entry.data.Title || ''
                    }));
                    allGameAchievements.push(...gameAchievements);
                }
            }

            // Use the appropriate game ID for the current month
            const currentGameId = isMarchChallenge ? '113355' : challenge.gameId;
            const completionStats = getGameCompletionStats(allGameAchievements, currentGameId);

            return {
                username,
                profileImage: `https://retroachievements.org/UserPic/${username}.png`,
                profileUrl: `https://retroachievements.org/user/${username}`,
                completedAchievements: completionStats.completed,
                totalAchievements: completionStats.total,
                completionPercentage: completionStats.percentage,
                hasBeatenGame: completionStats.hasBeatenGame,
                achievements: allGameAchievements
            };
        });

        cache.leaderboard = {
            leaderboard: usersProgress.sort((a, b) => parseFloat(b.completionPercentage) - parseFloat(a.completionPercentage)),
            gameInfo: challenge,
            lastUpdated: new Date().toISOString()
        };
        cache.leaderboardTimestamp = Date.now();

        return cache.leaderboard;
    } catch (error) {
        console.error('[RA API] Error fetching leaderboard data:', error);
        throw error;
    }
}

// Helper function to calculate game completion stats
function getGameCompletionStats(achievements, gameId) {
    // Filter achievements for the specific game
    const gameAchievements = achievements.filter(a => String(a.GameID) === gameId);
    
    // Calculate total and completed achievements
    const total = gameAchievements.length;
    const completed = gameAchievements.filter(ach => parseInt(ach.DateEarned, 10) > 0).length;

    // Fallback for Mega Man X5 if no achievements found
    const defaultTotal = gameId === '113355' ? 53 : 0;

    const hasBeatenGame = gameAchievements.some(ach => {
        const isWinCondition = (ach.Flags & 2) === 2;
        const isEarned = parseInt(ach.DateEarned, 10) > 0;
        return isWinCondition && isEarned;
    });
    
    // Return stats with fallback for total
    return {
        completed: completed || 0,
        total: total || defaultTotal,
        percentage: total > 0 ? ((completed / total) * 100).toFixed(2) : '0.00',
        hasBeatenGame
    };
}

// ---------------------------------------
// Fetch User Progress for Multiple Games
// ---------------------------------------
async function batchFetchUserProgress(usernames, gameIds) {
    const fetchResults = [];
    const CHUNK_SIZE = 1;
    const CHUNK_DELAY_MS = 1500;

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

async function fetchCompleteGameProgress(username, gameId) {
    try {
        const params = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            g: gameId,
            u: username
        });

        const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
        const response = await rateLimiter.makeRequest(url);

        if (!response || !response.Achievements) {
            return null;
        }

        // Transform achievements into a consistent format
        const achievements = Object.values(response.Achievements).map(ach => ({
            ...ach,
            GameID: gameId,
            GameTitle: response.Title || ''
        }));

        return achievements;
    } catch (error) {
        console.error(`[RA API] Error fetching complete progress for ${username}, game ${gameId}:`, error);
        return null;
    }
}

async function fetchHistoricalProgress(usernames, gameIds) {
    try {
        console.log('[RA API] Fetching historical progress...');
        
        const results = new Map();
        const CHUNK_DELAY_MS = 1500;

        for (const username of usernames) {
            const userProgress = new Map();
            
            for (const gameId of gameIds) {
                const achievements = await fetchCompleteGameProgress(username, gameId);
                if (achievements) {
                    userProgress.set(gameId, achievements);
                }
                await delay(CHUNK_DELAY_MS); // Respect rate limits between requests
            }
            
            if (userProgress.size > 0) {
                results.set(username, userProgress);
            }
            
            console.log(`[RA API] Fetched progress for ${username}: ${userProgress.size} games`);
        }

        return results;
    } catch (error) {
        console.error('[RA API] Error fetching historical progress:', error);
        throw error;
    }
}

// ---------------------------------------
// Fetch All Recent Achievements
// ---------------------------------------
async function fetchAllRecentAchievements() {
    try {
        console.log('[RA API] Fetching ALL recent achievements...');

        const validUsers = await database.getValidUsers();
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

        return allAchievements.length > 0 ? allAchievements : [];
    } catch (error) {
        console.error('[RA API] Error in fetchAllRecentAchievements:', error);
        return [];
    }
}

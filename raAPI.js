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
    cooldown: 5000, // Increased from 1250ms to 5000ms (4x slower)
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

// Game progress cache
const gameProgressCache = new Map();
const GAME_PROGRESS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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
    const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes (increased from 5 minutes)

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

        // Only track the current month's games instead of all games
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        const isMarchChallenge = month === 3 && year === 2025;
        
        // Get only current month's games (monthly + shadow)
        let trackedGames = [];
        if (isMarchChallenge) {
            trackedGames = ['11335', '7181']; // Just Mega Man X5 and Monster Rancher Advance 2
        } else {
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            const monthConfig = require('./monthlyGames').monthlyGames[monthKey];
            if (monthConfig) {
                trackedGames = [
                    monthConfig.monthlyGame.id,
                    monthConfig.shadowGame.id
                ].filter(Boolean);
            } else {
                trackedGames = [challenge.gameId]; // Fallback to current challenge only
            }
        }

        console.log(`[RA API] Only tracking ${trackedGames.length} games: ${trackedGames.join(', ')}`);
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
            const currentGameId = isMarchChallenge ? '11335' : challenge.gameId;
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
    const defaultTotal = gameId === '11335' ? 53 : 0;

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
    const CHUNK_DELAY_MS = 6000; // Increased from 1500ms to 6000ms (4x slower)

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
        // Check cache first
        const cacheKey = `${username}-${gameId}`;
        const cachedData = gameProgressCache.get(cacheKey);
        
        if (cachedData && (Date.now() - cachedData.timestamp) < GAME_PROGRESS_CACHE_TTL) {
            return cachedData.data;
        }

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

        // Cache the result
        gameProgressCache.set(cacheKey, {
            data: achievements,
            timestamp: Date.now()
        });

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
        const CHUNK_DELAY_MS = 6000; // Increased from 1500ms to 6000ms (4x slower)

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

        // Check all users instead of limiting to just the top active ones
        // Set a reasonable upper limit to prevent overloading
        const USER_LIMIT = 50; // Increased from 20
        const ACHIEVEMENTS_PER_USER = 25; // Increased from 20
        const CHUNK_SIZE = 1;
        const CHUNK_DELAY_MS = 6000; // 6 seconds between requests to respect rate limits

        // Use all users up to the limit
        const usersToCheck = validUsers.slice(0, USER_LIMIT);
        console.log(`[RA API] Checking recent achievements for ${usersToCheck.length} users`);

        const allAchievements = [];

        for (let i = 0; i < usersToCheck.length; i += CHUNK_SIZE) {
            const chunk = usersToCheck.slice(i, i + CHUNK_SIZE);

            const chunkPromises = chunk.map(async username => {
                try {
                    const params = new URLSearchParams({
                        z: process.env.RA_USERNAME,
                        y: process.env.RA_API_KEY,
                        u: username,
                        c: ACHIEVEMENTS_PER_USER  // Increased number of recent achievements to fetch
                    });

                    const url = `https://retroachievements.org/API/API_GetUserRecentAchievements.php?${params}`;
                    const recentData = await rateLimiter.makeRequest(url);

                    // Add detailed logging
                    if (Array.isArray(recentData) && recentData.length > 0) {
                        console.log(`[RA API] Found ${recentData.length} recent achievements for ${username}`);
                    }

                    // Make sure we have an array even if the API returns something unexpected
                    const achievements = Array.isArray(recentData) ? recentData : [];
                    return { username, achievements };
                } catch (error) {
                    console.error(`[RA API] Error fetching achievements for ${username}:`, error);
                    return { username, achievements: [] };
                }
            });

            const chunkResults = await Promise.all(chunkPromises);
            allAchievements.push(...chunkResults);

            if (i + CHUNK_SIZE < usersToCheck.length) {
                await delay(CHUNK_DELAY_MS);
            }
        }

        // Log the total number of achievements found
        const totalAchievements = allAchievements.reduce((total, user) => total + user.achievements.length, 0);
        console.log(`[RA API] Found a total of ${totalAchievements} recent achievements across ${allAchievements.length} users`);

        return allAchievements.length > 0 ? allAchievements : [];
    } catch (error) {
        console.error('[RA API] Error in fetchAllRecentAchievements:', error);
        return [];
    }
}

// Helper function to get most active users based on leaderboard data
async function getActiveUsers(validUsers, limit = 20) {
    try {
        // First, try to get the current leaderboard data from cache
        const leaderboardData = cache.leaderboard?.leaderboard || [];
        
        if (leaderboardData.length > 0) {
            // Filter users who have made progress in the current monthly challenge
            const activeUsers = leaderboardData
                .filter(user => 
                    // User has some completion percentage
                    parseFloat(user.completionPercentage) > 0 ||
                    // Or has unlocked at least one achievement
                    user.completedAchievements > 0
                )
                .map(user => user.username);
            
            // If we have active users, return them (up to the limit)
            if (activeUsers.length > 0) {
                console.log(`[RA API] Found ${activeUsers.length} active users from leaderboard data`);
                return activeUsers.slice(0, limit);
            }
        }
        
        // If we can't determine activity from leaderboard, try recent timestamps
        try {
            const timestamps = await database.getLastAchievementTimestamps();
            
            // Sort users by recency of their last achievement
            const sortedUsers = Object.entries(timestamps)
                .filter(([username]) => validUsers.includes(username.toLowerCase()))
                .sort(([, timeA], [, timeB]) => timeB - timeA)
                .map(([username]) => username);
            
            if (sortedUsers.length > 0) {
                console.log(`[RA API] Found ${sortedUsers.length} users with recent activity`);
                return sortedUsers.slice(0, limit);
            }
        } catch (error) {
            console.error('[RA API] Error getting timestamps:', error);
        }

        // Fallback to random sampling if we still have no active users
        const shuffledUsers = [...validUsers].sort(() => 0.5 - Math.random());
        console.log(`[RA API] Using random sampling of ${limit} users from ${validUsers.length} total users`);
        return shuffledUsers.slice(0, limit);
    } catch (error) {
        console.error('[RA API] Error getting active users:', error);
        return validUsers.slice(0, 10); // Fallback to first 10 users
    }
}

// Export all functions
module.exports = {
    fetchLeaderboardData,
    fetchAllRecentAchievements,
    fetchUserProfile,
    fetchHistoricalProgress,
    fetchCompleteGameProgress,
    getGameCompletionStats,
    batchFetchUserProgress
};

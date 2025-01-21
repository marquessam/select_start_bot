// raAPI.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const database = require('./database');
const { ErrorHandler } = require('./utils/errorHandler');

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

// ---------------------------------------
// Cache setup
// ---------------------------------------
const cache = {
    userSummaries: new Map(),
    userProfiles: new Map(),
    leaderboardData: null,
    summaryTTL: 300000,     // 5 minutes
    profileTTL: 3600000,    // 1 hour
    leaderboardTTL: 600000, // 10 minutes
    lastLeaderboardUpdate: 0,

    shouldUpdate(type, timestamp) {
        const ttl = this[`${type}TTL`];
        return !timestamp || (Date.now() - timestamp > ttl);
    },

    setCache(type, key, data) {
        this[type].set(key.toLowerCase(), {
            data,
            timestamp: Date.now()
        });
    },

    getCache(type, key) {
        const cached = this[type].get(key.toLowerCase());
        if (cached && !this.shouldUpdate(type, cached.timestamp)) {
            return cached.data;
        }
        return null;
    }
};

// ---------------------------------------
// API Functions
// ---------------------------------------
async function fetchUserSummary(username) {
    try {
        // Check cache first
        const cached = cache.getCache('userSummaries', username);
        if (cached) return cached;

        const params = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            u: username
        });

        const url = `https://retroachievements.org/API/API_GetUserSummary.php?${params}`;
        const data = await rateLimiter.makeRequest(url);

        const summary = {
            username: data.Username,
            totalPoints: parseInt(data.TotalPoints) || 0,
            totalTruePoints: parseInt(data.TotalTruePoints) || 0,
            rank: parseInt(data.Rank) || 0,
            recentAchievements: data.RecentAchievements || [],
            recentlyPlayedCount: parseInt(data.RecentlyPlayedCount) || 0,
            lastActivity: data.LastActivity,
            memberSince: data.MemberSince,
            userPic: data.UserPic,
            status: data.Status
        };

        // Update cache
        cache.setCache('userSummaries', username, summary);

        return summary;
    } catch (error) {
        console.error(`[RA API] Error fetching user summary for ${username}:`, error);
        return null;
    }
}

async function fetchUserProfile(username) {
    try {
        // Check cache first
        const cached = cache.getCache('userProfiles', username);
        if (cached) return cached;

        const summary = await fetchUserSummary(username);
        if (!summary) {
            throw new Error(`Failed to fetch summary for ${username}`);
        }

        const profile = {
            username: summary.username,
            profileImage: summary.userPic
                ? `https://retroachievements.org${summary.userPic}`
                : `https://retroachievements.org/UserPic/${username}.png`,
            profileUrl: `https://retroachievements.org/user/${username}`,
            totalPoints: summary.totalPoints,
            rank: summary.rank,
            memberSince: summary.memberSince,
            lastActivity: summary.lastActivity
        };

        // Update cache
        cache.setCache('userProfiles', username, profile);

        return profile;
    } catch (error) {
        console.error(`[RA API] Error fetching user profile for ${username}:`, error);
        return {
            username,
            profileImage: `https://retroachievements.org/UserPic/${username}.png`,
            profileUrl: `https://retroachievements.org/user/${username}`,
            totalPoints: 0,
            rank: 0
        };
    }
}

async function fetchLeaderboardData(force = false) {
    try {
        // Check cache first
        if (!force && cache.leaderboardData && 
            !cache.shouldUpdate('leaderboard', cache.lastLeaderboardUpdate)) {
            console.log('[RA API] Returning cached leaderboard data');
            return cache.leaderboardData;
        }

        console.log('[RA API] Fetching fresh leaderboard data');

        const challenge = await database.getCurrentChallenge();
        if (!challenge || !challenge.gameId) {
            throw new Error('No active challenge found in database');
        }

        const validUsers = await database.getValidUsers();
        console.log(`[RA API] Fetching data for ${validUsers.length} users`);

        const gamesToCheck = ['319', '10024']; // Chrono Trigger and Mario Tennis
        const userProgressData = await batchFetchUserProgress(validUsers, gamesToCheck);

        const usersProgress = [];
        for (const username of validUsers) {
            try {
                let allGameAchievements = [];

                // Get all game data for this user
                for (const gameId of gamesToCheck) {
                    const progressEntry = userProgressData.find(p => 
                        p.username === username && p.gameId === gameId
                    );

                    if (progressEntry?.data?.Achievements) {
                        const gameAchievements = Object.values(progressEntry.data.Achievements).map(ach => ({
                            ...ach,
                            GameID: gameId
                        }));
                        allGameAchievements = [...allGameAchievements, ...gameAchievements];
                    }
                }

                // Calculate main game progress
                const mainGameAchievements = allGameAchievements.filter(a => 
                    a.GameID === challenge.gameId
                );
                const numAchievements = mainGameAchievements.length;
                const completed = mainGameAchievements.filter(
                    ach => parseInt(ach.DateEarned, 10) > 0
                ).length;

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
                    completionPercentage: numAchievements > 0
                        ? ((completed / numAchievements) * 100).toFixed(2)
                        : '0.00',
                    hasBeatenGame: !!hasBeatenGame,
                    achievements: allGameAchievements
                });

                console.log(
                    `[RA API] Processed achievements for ${username}:`,
                    `${completed}/${numAchievements} achievements (main challenge)`,
                    `Total achievements tracked: ${allGameAchievements.length}`
                );
            } catch (error) {
                console.error(`[RA API] Error processing data for ${username}:`, error);
                usersProgress.push({
                    username,
                    profileImage: `https://retroachievements.org/UserPic/${username}.png`,
                    profileUrl: `https://retroachievements.org/user/${username}`,
                    completedAchievements: 0,
                    totalAchievements: 0,
                    completionPercentage: '0.00',
                    hasBeatenGame: false,
                    achievements: []
                });
            }
        }

        const leaderboardData = {
            leaderboard: usersProgress.sort(
                (a, b) => parseFloat(b.completionPercentage) - parseFloat(a.completionPercentage)
            ),
            gameInfo: challenge,
            lastUpdated: new Date().toISOString()
        };

        // Update cache
        cache.leaderboardData = leaderboardData;
        cache.lastLeaderboardUpdate = Date.now();

        console.log(`[RA API] Leaderboard data updated with ${usersProgress.length} users`);
        return leaderboardData;
    } catch (error) {
        console.error('[RA API] Error fetching leaderboard data:', error);
        throw error;
    }
}

async function batchFetchUserProgress(usernames, gameIds) {
    const results = [];
    for (const username of usernames) {
        for (const gameId of gameIds) {
            const params = new URLSearchParams({
                z: process.env.RA_USERNAME,
                y: process.env.RA_API_KEY,
                g: gameId,
                u: username
            });
            try {
                const data = await rateLimiter.makeRequest(
                    `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`
                );
                results.push({ username, gameId, data });
            } catch (error) {
                console.error(`[RA API] Error fetching progress for ${username}, game ${gameId}:`, error);
            }
        }
    }
    return results;
}

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

                let finalAchievements = [];
                if (Array.isArray(recentData)) {
                    finalAchievements = recentData;
                } else {
                    console.warn(`[RA API] "recentData" was not an array for user: ${username}. Using empty array instead.`);
                }

                allRecentAchievements.push({
                    username,
                    achievements: finalAchievements
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

function clearCaches() {
    cache.userSummaries.clear();
    cache.userProfiles.clear();
    cache.leaderboardData = null;
    cache.lastLeaderboardUpdate = 0;
    console.log('[RA API] All caches cleared');
}

module.exports = {
    fetchUserSummary,
    fetchUserProfile,
    fetchLeaderboardData,
    fetchAllRecentAchievements,
    clearCaches
};

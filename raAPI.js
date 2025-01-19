// raAPI.js
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
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
    leaderboardTTL: 300000, // 5 minutes
    lastLeaderboardUpdate: 0
};

// ---------------------------------------
// API Functions
// ---------------------------------------

/**
 * Fetch a user's summary data from RetroAchievements
 */
async function fetchUserSummary(username) {
    try {
        // Check cache first
        const cachedSummary = cache.userSummaries.get(username.toLowerCase());
        if (cachedSummary && (Date.now() - cachedSummary.timestamp < cache.summaryTTL)) {
            return cachedSummary.data;
        }

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
        cache.userSummaries.set(username.toLowerCase(), {
            data: summary,
            timestamp: Date.now()
        });

        return summary;
    } catch (error) {
        console.error(`[RA API] Error fetching user summary for ${username}:`, error);
        return null;
    }
}

/**
 * Fetch a user's profile information
 */
async function fetchUserProfile(username) {
    try {
        // Check cache first
        const cachedProfile = cache.userProfiles.get(username.toLowerCase());
        if (cachedProfile && (Date.now() - cachedProfile.timestamp < cache.profileTTL)) {
            return cachedProfile.data;
        }

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
        cache.userProfiles.set(username.toLowerCase(), {
            data: profile,
            timestamp: Date.now()
        });

        return profile;
    } catch (error) {
        console.error(`[RA API] Error fetching user profile for ${username}:`, error);
        // Return default profile on error
        return {
            username,
            profileImage: `https://retroachievements.org/UserPic/${username}.png`,
            profileUrl: `https://retroachievements.org/user/${username}`,
            totalPoints: 0,
            rank: 0
        };
    }
}

/**
 * Fetch leaderboard data including challenge progress
 */
async function fetchLeaderboardData() {
    try {
        console.log('[RA API] Fetching fresh leaderboard data');

        const challenge = await database.getCurrentChallenge();
        if (!challenge || !challenge.gameId) {
            throw new Error('No active challenge found in database');
        }

        const validUsers = await database.getValidUsers();
        console.log(`[RA API] Fetching data for ${validUsers.length} users`);

        // 1) Fetch all user summaries first (in parallel)
        const userSummaries = await Promise.all(
            validUsers.map(async username => {
                try {
                    return await fetchUserSummary(username);
                } catch (error) {
                    console.error(`[RA API] Error fetching summary for ${username}:`, error);
                    return null;
                }
            })
        );

        const usersProgress = [];

        // Define the games we want to check (main challenge and side game)
        const gamesToCheck = ['319', '10024']; // Chrono Trigger and Mario Tennis

        // 2) For each user, fetch all game data
        for (const username of validUsers) {
            if (!username) {
                console.error('[RA API] Skipping undefined username');
                continue;
            }

            try {
                // Find the user's summary
                const userSummary = userSummaries.find(
                    s => s && s.username && username &&
                        s.username.toLowerCase() === username.toLowerCase()
                );

                let allGameAchievements = [];

                // Fetch data for each game
                for (const gameId of gamesToCheck) {
                    const challengeParams = new URLSearchParams({
                        z: process.env.RA_USERNAME,
                        y: process.env.RA_API_KEY,
                        g: gameId,
                        u: username
                    });

                    const gameData = await rateLimiter.makeRequest(
                        `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${challengeParams}`
                    );

                    if (gameData?.Achievements) {
                        const gameAchievements = Object.values(gameData.Achievements).map(ach => ({
                            ...ach,
                            GameID: gameId // Ensure GameID is set correctly
                        }));
                        allGameAchievements = [...allGameAchievements, ...gameAchievements];
                    }
                }

                // Map userSummary recent achievements
                const mappedRecents = (userSummary?.recentAchievements || []).map(r => ({
                    ID: parseInt(r.AchievementID),
                    DateEarned: r.Date,
                    Flags: r.Flags ? parseInt(r.Flags) : 0,
                    GameID: r.GameID ? parseInt(r.GameID) : null
                }));

                // Combine all achievements
                const allAchievements = [
                    ...allGameAchievements,
                    ...mappedRecents
                ];

                // For main challenge scoreboard display
                const mainGameAchievements = allGameAchievements.filter(a => a.GameID === challenge.gameId);
                const numAchievements = mainGameAchievements.length;
                const completed = mainGameAchievements.filter(
                    ach => parseInt(ach.DateEarned, 10) > 0
                ).length;

                // Check for beaten game condition for main game
                const hasBeatenGame = mainGameAchievements.some(ach => {
                    const isWinCondition = (ach.Flags & 2) === 2;
                    const isEarned = parseInt(ach.DateEarned, 10) > 0;
                    return isWinCondition && isEarned;
                });

                // Summarize user data
                usersProgress.push({
                    username,
                    profileImage: userSummary?.userPic
                        ? `https://retroachievements.org${userSummary.userPic}`
                        : `https://retroachievements.org/UserPic/${username}.png`,
                    profileUrl: `https://retroachievements.org/user/${username}`,
                    completedAchievements: completed,
                    totalAchievements: numAchievements,
                    completionPercentage: numAchievements > 0
                        ? ((completed / numAchievements) * 100).toFixed(2)
                        : '0.00',
                    hasBeatenGame: !!hasBeatenGame,
                    achievements: allAchievements, // Include ALL achievements for both games
                    totalPoints: userSummary?.totalPoints || 0,
                    rank: userSummary?.rank || 0,
                    recentAchievements: userSummary?.recentAchievements || [],
                    lastActivity: userSummary?.lastActivity
                });

                console.log(
                    `[RA API] Fetched progress for ${username}:`,
                    `${completed}/${numAchievements} achievements (main challenge)`,
                    `Total achievements tracked: ${allAchievements.length}`
                );
            } catch (error) {
                console.error(`[RA API] Error fetching data for ${username}:`, error);
                // Add fallback entry
                usersProgress.push({
                    username,
                    profileImage: `https://retroachievements.org/UserPic/${username}.png`,
                    profileUrl: `https://retroachievements.org/user/${username}`,
                    completedAchievements: 0,
                    totalAchievements: 0,
                    completionPercentage: '0.00',
                    hasBeatenGame: false,
                    achievements: [],
                    totalPoints: 0,
                    rank: 0,
                    recentAchievements: [],
                    lastActivity: null
                });
            }
        }

        // Build final leaderboard data
        const leaderboardData = {
            leaderboard: usersProgress.sort(
                (a, b) => parseFloat(b.completionPercentage) - parseFloat(a.completionPercentage)
            ),
            gameInfo: challenge,
            lastUpdated: new Date().toISOString()
        };

        console.log(`[RA API] Leaderboard data updated with ${usersProgress.length} users`);
        return leaderboardData;
    } catch (error) {
        console.error('[RA API] Error fetching leaderboard data:', error);
        throw error;
    }
}

/**
 * Fetch all recent achievements for all users
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

                // Ensure `achievements` is always an array
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

/**
 * Clear all caches
 */
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

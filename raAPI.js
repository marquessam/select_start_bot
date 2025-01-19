// raAPI.js

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const database = require('./database');
const { monthlyGames, getActiveGamesForMonth, getCurrentYearMonth } = require('./monthlyGames');

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
    userProfiles: new Map(),
    leaderboardData: null,
    profileTTL: 3600000, // 1 hour
    leaderboardTTL: 300000, // 5 minutes
    lastLeaderboardUpdate: 0
};

// ---------------------------------------
// Fetch user profile data
// ---------------------------------------
async function fetchUserProfile(username) {
    try {
        // Check cache first
        const cachedProfile = cache.userProfiles.get(username);
        if (cachedProfile && (Date.now() - cachedProfile.timestamp < cache.profileTTL)) {
            return cachedProfile.data;
        }

        const params = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            u: username
        });

        const url = `https://retroachievements.org/API/API_GetUserSummary.php?${params}`;
        const data = await rateLimiter.makeRequest(url);

        const profile = {
            username: data.Username,
            profileImage: `https://retroachievements.org${data.UserPic}`,
            profileUrl: `https://retroachievements.org/user/${data.Username}`
        };

        // Update cache
        cache.userProfiles.set(username, {
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
            profileUrl: `https://retroachievements.org/user/${username}`
        };
    }
}

// ---------------------------------------
// Fetch monthlyGames-based + challenge-based leaderboard data
// ---------------------------------------
async function fetchLeaderboardData() {
    try {
        // Check if we have recent data in cache
        if (cache.leaderboardData && Date.now() - cache.lastLeaderboardUpdate < cache.leaderboardTTL) {
            console.log('[RA API] Returning cached leaderboard data');
            return cache.leaderboardData;
        }

        console.log('[RA API] Fetching fresh leaderboard data');

        const challenge = await database.getCurrentChallenge();
        if (!challenge || !challenge.gameId) {
            throw new Error('No active challenge found in database');
        }

        // 1) Get all valid users from DB
        const validUsers = await database.getValidUsers();
        console.log(`[RA API] Fetching data for ${validUsers.length} users`);

        // 2) Determine which monthly games are active this month (including side games)
        const currentMonth = getCurrentYearMonth(); // e.g. "2025-01"
        const activeGames = getActiveGamesForMonth(); 
        // e.g. [ {month:'2025-01',gameId:'319', checks:[...],...}, {month:'2025-01',gameId:'10024',...} ]

        // For leaderboard ranking, we'll still treat 'challenge.gameId' as the main scoreboard
        // but we will fetch the side games so userStats has all achievements for awarding participation.
        
        const usersProgress = [];

        for (const username of validUsers) {
            try {
                // 3) Profile fetch
                const profile = await fetchUserProfile(username);

                // 4) Full achievements for each monthly game (current + side)
                let allGameAchievements = [];
                for (const gameCfg of activeGames) {
                    // For each active monthly game, do a full fetch:
                    const gameParams = new URLSearchParams({
                        z: process.env.RA_USERNAME,
                        y: process.env.RA_API_KEY,
                        g: gameCfg.gameId,
                        u: username
                    });

                    let gameData = null;
                    try {
                        gameData = await rateLimiter.makeRequest(
                            `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${gameParams}`
                        );
                    } catch (gErr) {
                        console.error(`[RA API] Error fetching full data for ${username}, gameId=${gameCfg.gameId}`, gErr);
                    }

                    // Merge achievements
                    if (gameData && gameData.Achievements) {
                        const gameAchievements = Object.values(gameData.Achievements);
                        allGameAchievements.push(...gameAchievements);
                    }
                }

                // 5) Also fetch last 50 recents for all other games
                const recentParams = new URLSearchParams({
                    z: process.env.RA_USERNAME,
                    y: process.env.RA_API_KEY,
                    u: username,
                    c: 50  // Last 50 achievements
                });
                let recentAchievements = [];
                try {
                    recentAchievements = await rateLimiter.makeRequest(
                        `https://retroachievements.org/API/API_GetUserRecentAchievements.php?${recentParams}`
                    );
                } catch (rErr) {
                    console.error(`[RA API] Error fetching recent achievements for ${username}:`, rErr);
                }
                allGameAchievements.push(...(recentAchievements || []));

                // 6) Filter duplicates if needed (optional)
                // For simplicity, we won't deduplicate. Rarely the same achievement appears in both sets.

                // 7) Calculate the scoreboard stats for the MAIN challenge (challenge.gameId)
                const mainChallengeAchievements = allGameAchievements.filter(a => 
                    parseInt(a.GameID) === parseInt(challenge.gameId)
                );
                const totalAchievements = mainChallengeAchievements.length;
                const completedAchievements = mainChallengeAchievements.filter(
                    ach => parseInt(ach.DateEarned, 10) > 0
                ).length;
                const completionPercentage = totalAchievements > 0 
                    ? ((completedAchievements / totalAchievements) * 100).toFixed(2)
                    : '0.00';

                // Check beaten
                const hasBeatenGame = mainChallengeAchievements.some(ach => {
                    const isWinCondition = (ach.Flags & 2) === 2;
                    const isEarned = parseInt(ach.DateEarned, 10) > 0;
                    return isWinCondition && isEarned;
                });

                usersProgress.push({
                    username,
                    profileImage: profile.profileImage,
                    profileUrl: profile.profileUrl,
                    completedAchievements,
                    totalAchievements,
                    completionPercentage,
                    hasBeatenGame,
                    achievements: allGameAchievements
                });

                console.log(
                    `[RA API] Fetched progress for ${username}: ` +
                    `${completedAchievements}/${totalAchievements} achievements (main challenge)`
                );
            } catch (error) {
                console.error(`[RA API] Error fetching data for ${username}:`, error);
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

        // 8) Sort by completionPercentage (for main challenge scoreboard)
        const leaderboardSorted = usersProgress.sort(
            (a,b) => parseFloat(b.completionPercentage) - parseFloat(a.completionPercentage)
        );

        const leaderboardData = {
            leaderboard: leaderboardSorted,
            gameInfo: challenge,
            lastUpdated: new Date().toISOString()
        };

        cache.leaderboardData = leaderboardData;
        cache.lastLeaderboardUpdate = Date.now();

        console.log(`[RA API] Leaderboard data updated with ${usersProgress.length} users`);

        return leaderboardData;

    } catch (error) {
        console.error('[RA API] Error fetching leaderboard data:', error);
        throw error;
    }
}

// ---------------------------------------
// NEW: fetchAllRecentAchievements
// Fetch each user's recent achievements from ALL games (for the feed)
// ---------------------------------------
async function fetchAllRecentAchievements() {
    try {
        console.log('[RA API] Fetching ALL recent achievements for each user...');

        // 1. Get list of valid users
        const validUsers = await database.getValidUsers();
        const allRecentAchievements = [];

        // 2. For each user, call the user recent achievements endpoint
        for (const username of validUsers) {
            try {
                const params = new URLSearchParams({
                    z: process.env.RA_USERNAME,
                    y: process.env.RA_API_KEY,
                    u: username,
                    c: 50 // last 50 achievements
                });

                const recentData = await rateLimiter.makeRequest(
                    `https://retroachievements.org/API/API_GetUserRecentAchievements.php?${params}`
                );

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
    fetchUserProfile,
    fetchLeaderboardData,
    fetchAllRecentAchievements
};

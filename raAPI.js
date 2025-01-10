// raAPI.js
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const database = require('./database');

// -----------------------------------------------------------------------------
// Rate limiting (SEQUENTIAL: concurrency=1) + backoff/retry for 429
// -----------------------------------------------------------------------------
const rateLimiter = {
    // Records last request time for a given URL to enforce cooldown
    requests: new Map(),
    // 2-second gap per request
    cooldown: 2000,
    // We are making requests strictly one at a time
    concurrentLimit: 1,

    queue: [],
    activeRequests: 0,
    processing: false,

    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0) {
            // If we haven't hit concurrency limit, process next request
            if (this.activeRequests < this.concurrentLimit) {
                const { url, resolve, reject } = this.queue.shift();
                this.activeRequests++;

                this.executeRequest(url)
                    .then(resolve)
                    .catch(reject)
                    .finally(() => {
                        this.activeRequests--;
                        this.processQueue();
                    });
            } else {
                // Wait a moment before re-checking if concurrency is reached
                await new Promise(r => setTimeout(r, 100));
            }
        }

        this.processing = false;
    },

    async executeRequest(url, attempt = 1) {
        // 1) Respect per-URL cooldown
        const now = Date.now();
        const lastRequestTime = this.requests.get(url) || 0;
        const waitTime = Math.max(0, lastRequestTime + this.cooldown - now);
        if (waitTime > 0) {
            await new Promise(r => setTimeout(r, waitTime));
        }

        let response;
        try {
            response = await fetch(url);
        } catch (err) {
            throw new Error(`Network error or fetch failed: ${err.message}`);
        }

        // Update the timestamp for this URL
        this.requests.set(url, Date.now());

        if (!response.ok) {
            // 2) Check if it's a 429 or "Too Many Requests"
            if (
                response.status === 429 ||
                response.statusText.toLowerCase().includes('too many requests')
            ) {
                const MAX_RETRIES = 3;
                const RETRY_DELAY = 5000; // 5 seconds
                if (attempt < MAX_RETRIES) {
                    console.warn(
                        `[RA API] 429 Too Many Requests. Backing off for ${RETRY_DELAY / 1000} seconds. Attempt #${attempt + 1}...`
                    );
                    await new Promise(r => setTimeout(r, RETRY_DELAY));
                    return this.executeRequest(url, attempt + 1);
                }
            }
            throw new Error(`Failed to fetch: ${response.statusText}`);
        }

        return response.json();
    },

    async makeRequest(url) {
        return new Promise((resolve, reject) => {
            this.queue.push({ url, resolve, reject });
            this.processQueue();
        });
    }
};

// -----------------------------------------------------------------------------
// Cache
// -----------------------------------------------------------------------------
const cache = {
    userProfiles: new Map(),
    leaderboardData: null,
    profileTTL: 3600000,     // 1 hour for user profiles
    leaderboardTTL: 1200000, // 20 minutes for leaderboard
    lastLeaderboardUpdate: 0
};

// -----------------------------------------------------------------------------
// Fetch user profile
// -----------------------------------------------------------------------------
async function fetchUserProfile(username) {
    try {
        // 1) Check cache
        const cachedProfile = cache.userProfiles.get(username);
        if (cachedProfile && (Date.now() - cachedProfile.timestamp < cache.profileTTL)) {
            return cachedProfile.data;
        }

        // 2) Build URL
        const params = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            u: username
        });
        const url = `https://retroachievements.org/API/API_GetUserSummary.php?${params}`;

        // 3) Request
        const data = await rateLimiter.makeRequest(url);

        // 4) Construct user profile
        const profile = {
            username: data.Username,
            profileImage: `https://retroachievements.org${data.UserPic}`,
            profileUrl: `https://retroachievements.org/user/${data.Username}`
        };

        // 5) Store in cache
        cache.userProfiles.set(username, {
            data: profile,
            timestamp: Date.now()
        });

        return profile;
    } catch (error) {
        console.error(`[RA API] Error fetching user profile for ${username}:`, error);
        // Fallback
        return {
            username,
            profileImage: `https://retroachievements.org/UserPic/${username}.png`,
            profileUrl: `https://retroachievements.org/user/${username}`
        };
    }
}

// -----------------------------------------------------------------------------
// Fetch all needed user data for challenge
// -----------------------------------------------------------------------------
async function fetchUserChallengeData(username, gameId) {
    try {
        // 1) Build query params
        const challengeParams = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            g: gameId,
            u: username
        });
        const recentParams = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            u: username,
            c: 50  // last 50 achievements
        });

        // 2) Fetch each piece sequentially (since we’re already limiting concurrency = 1)
        //    But you can still do `Promise.all` if you want them in parallel for a single user
        //    RA might still handle it okay for a single user. If you want to be super safe, do them in sequence.
        const challengeData = await rateLimiter.makeRequest(`https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${challengeParams}`);
        const profile       = await fetchUserProfile(username);
        const recentAchievements = await rateLimiter.makeRequest(`https://retroachievements.org/API/API_GetUserRecentAchievements.php?${recentParams}`);

        // 3) Process challenge achievements
        const challengeAchievements = challengeData.Achievements ? Object.values(challengeData.Achievements) : [];
        const numAchievements = challengeAchievements.length;
        const completed = challengeAchievements.filter(ach => parseInt(ach.DateEarned) > 0).length;

        // 4) Check "beaten game" condition
        const hasBeatenGame = challengeAchievements.some(ach => {
            // "Beaten" => (ach.Flags & 2) === 2
            const isWinCondition = (ach.Flags & 2) === 2;
            const isEarned = parseInt(ach.DateEarned) > 0;
            return isWinCondition && isEarned;
        });

        // 5) Combine achievements
        const allAchievements = [
            ...challengeAchievements,
            ...(recentAchievements || [])
        ];

        // 6) Return user stats
        return {
            username,
            profileImage: profile.profileImage,
            profileUrl: profile.profileUrl,
            completedAchievements: completed,
            totalAchievements: numAchievements,
            completionPercentage: numAchievements > 0 ? ((completed / numAchievements) * 100).toFixed(2) : '0.00',
            hasBeatenGame: !!hasBeatenGame,
            achievements: allAchievements
        };
    } catch (error) {
        console.error(`[RA API] Error fetching data for ${username}:`, error);
        return {
            username,
            profileImage: `https://retroachievements.org/UserPic/${username}.png`,
            profileUrl: `https://retroachievements.org/user/${username}`,
            completedAchievements: 0,
            totalAchievements: 0,
            completionPercentage: '0.00',
            hasBeatenGame: false,
            achievements: []
        };
    }
}

// -----------------------------------------------------------------------------
// Fetch leaderboard data (cached for 20 minutes)
// -----------------------------------------------------------------------------
async function fetchLeaderboardData() {
    try {
        // 1) Check if valid cache exists
        if (cache.leaderboardData && (Date.now() - cache.lastLeaderboardUpdate < cache.leaderboardTTL)) {
            console.log('[RA API] Returning cached leaderboard data');
            return cache.leaderboardData;
        }

        console.log('[RA API] Fetching fresh leaderboard data');

        // 2) Get current challenge
        const challenge = await database.getCurrentChallenge();
        if (!challenge || !challenge.gameId) {
            throw new Error('No active challenge found in database');
        }

        // 3) Get valid users
        const validUsers = await database.getValidUsers();
        console.log(`[RA API] Fetching data for ${validUsers.length} users`);

        // 4) Fetch each user’s data (sequential concurrency = 1 enforced by rateLimiter)
        const usersProgress = [];
        for (const username of validUsers) {
            const userData = await fetchUserChallengeData(username, challenge.gameId);
            usersProgress.push(userData);
        }

        // 5) Sort by completion percentage desc
        const leaderboardData = {
            leaderboard: usersProgress.sort((a, b) => b.completionPercentage - a.completionPercentage),
            gameInfo: challenge,
            lastUpdated: new Date().toISOString()
        };

        // 6) Cache
        cache.leaderboardData = leaderboardData;
        cache.lastLeaderboardUpdate = Date.now();

        console.log(`[RA API] Leaderboard data updated with ${usersProgress.length} users`);
        return leaderboardData;
    } catch (error) {
        console.error('[RA API] Error fetching leaderboard data:', error);
        throw error;
    }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------
module.exports = {
    fetchUserProfile,
    fetchLeaderboardData
};

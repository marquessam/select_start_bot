// raAPI.js
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const database = require('./database');

// -----------------------------------------------------------------------------
// Rate limiting setup with up to 5 concurrent requests
// -----------------------------------------------------------------------------
const rateLimiter = {
    requests: new Map(),
    cooldown: 1000,       // 1 second minimum delay between requests to the same URL
    concurrentLimit: 5,   // max number of requests allowed in parallel
    queue: [],
    activeRequests: 0,
    processing: false,

    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0) {
            // If we haven't hit the concurrency limit, process the next request
            if (this.activeRequests < this.concurrentLimit) {
                const { url, resolve, reject } = this.queue.shift();
                this.activeRequests++;

                // Fire off the request (which applies its own per-URL cooldown)
                this.executeRequest(url)
                    .then(resolve)
                    .catch(reject)
                    .finally(() => {
                        this.activeRequests--;
                        // Keep processing until the queue is empty
                        this.processQueue();
                    });
            } else {
                // If we're at the concurrency limit, wait a bit and try again
                await new Promise(r => setTimeout(r, 100));
            }
        }

        this.processing = false;
    },

    async executeRequest(url) {
        // Enforce a cooldown based on last request time for this URL
        const now = Date.now();
        const lastRequestTime = this.requests.get(url) || 0;
        const waitTime = Math.max(0, lastRequestTime + this.cooldown - now);

        if (waitTime > 0) {
            await new Promise(r => setTimeout(r, waitTime));
        }

        const response = await fetch(url);
        this.requests.set(url, Date.now()); // mark last request time

        if (!response.ok) {
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
// Cache setup
// -----------------------------------------------------------------------------
const cache = {
    userProfiles: new Map(),
    leaderboardData: null,
    profileTTL: 3600000,     // 1 hour for user profile
    leaderboardTTL: 1200000, // 20 minutes for leaderboard data
    lastLeaderboardUpdate: 0
};

// -----------------------------------------------------------------------------
// Fetch user profile (with caching)
// -----------------------------------------------------------------------------
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
        // Return a default profile on error
        return {
            username,
            profileImage: `https://retroachievements.org/UserPic/${username}.png`,
            profileUrl: `https://retroachievements.org/user/${username}`
        };
    }
}

// -----------------------------------------------------------------------------
// Helper to process each user's data (challenge progress, profile, achievements)
// -----------------------------------------------------------------------------
async function fetchUserChallengeData(username, gameId) {
    try {
        // Build query params
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
            c: 50  // Last 50 achievements
        });

        // Fetch in parallel
        const [challengeData, profile, recentAchievements] = await Promise.all([
            rateLimiter.makeRequest(`https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${challengeParams}`),
            fetchUserProfile(username),
            rateLimiter.makeRequest(`https://retroachievements.org/API/API_GetUserRecentAchievements.php?${recentParams}`)
        ]);

        // Process challenge achievements
        const challengeAchievements = challengeData.Achievements ? Object.values(challengeData.Achievements) : [];
        const numAchievements = challengeAchievements.length;
        const completed = challengeAchievements.filter(ach => parseInt(ach.DateEarned) > 0).length;

        // Check for 'beaten game' achievement
        const hasBeatenGame = challengeAchievements.some(ach => {
            // "isWinCondition" => (ach.Flags & 2) === 2
            const isWinCondition = (ach.Flags & 2) === 2;
            const isEarned = parseInt(ach.DateEarned) > 0;
            return isWinCondition && isEarned;
        });

        // Combine achievements for feed
        const allAchievements = [
            ...challengeAchievements,
            ...(recentAchievements || [])
        ];

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
        // Return fallback data
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
// Fetch leaderboard data (with 20-minute caching)
// -----------------------------------------------------------------------------
async function fetchLeaderboardData() {
    try {
        // Check if cached data is still valid
        if (cache.leaderboardData && (Date.now() - cache.lastLeaderboardUpdate < cache.leaderboardTTL)) {
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

        // Collect progress for each valid user
        const usersProgressPromises = validUsers.map((username) =>
            fetchUserChallengeData(username, challenge.gameId)
        );

        // Wait until all user data is fetched (up to 5 at a time, thanks to rateLimiter concurrency)
        const usersProgress = await Promise.all(usersProgressPromises);

        // Sort by completion percentage descending
        const leaderboardData = {
            leaderboard: usersProgress.sort((a, b) => b.completionPercentage - a.completionPercentage),
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

// Export the main functions
module.exports = {
    fetchUserProfile,
    fetchLeaderboardData
};

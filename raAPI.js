// raAPI.js
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const database = require('./database');

// Rate limiting setup
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

// Cache setup
const cache = {
    userProfiles: new Map(),
    leaderboardData: null,
    profileTTL: 3600000, // 1 hour
    leaderboardTTL: 300000, // 5 minutes
    lastLeaderboardUpdate: 0
};

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

async function fetchLeaderboardData() {
    try {
        // Check if cached data is still valid
        if (cache.leaderboardData && 
            (Date.now() - cache.lastLeaderboardUpdate < cache.leaderboardTTL)) {
            console.log('[RA API] Returning cached leaderboard data');
            return cache.leaderboardData;
        }

        console.log('[RA API] Fetching fresh leaderboard data');

        const challenge = await database.getCurrentChallenge();
        if (!challenge || !challenge.gameId) {
            throw new Error('No active challenge found in database');
        }

        // Get users from database
        const validUsers = await database.getValidUsers();
        console.log(`[RA API] Fetching data for ${validUsers.length} users`);

        const usersProgress = [];
        for (const username of validUsers) {
            try {
                const params = new URLSearchParams({
                    z: process.env.RA_USERNAME,
                    y: process.env.RA_API_KEY,
                    g: challenge.gameId,
                    u: username
                });

                const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
                const data = await rateLimiter.makeRequest(url);

                const profile = await fetchUserProfile(username);
                const achievements = data.Achievements ? Object.values(data.Achievements) : [];
                const numAchievements = achievements.length;
                const completed = achievements.filter(ach => parseInt(ach.DateEarned) > 0).length;

                // Check for beaten achievement
                const hasBeatenGame = achievements.some(ach => 
                (ach.Flags & 2) === 2 && parseInt(ach.DateEarned) > 0
);

                    usersProgress.push({
                        username,
                        profileImage: profile.profileImage,
                        profileUrl: profile.profileUrl,
                        completedAchievements: completed,
                        totalAchievements: numAchievements,
                        completionPercentage: numAchievements > 0 ? ((completed / numAchievements) * 100).toFixed(2) : "0.00",
                        hasBeatenGame: hasBeatenGame ? true : false,
                        achievements: achievements
});


                console.log(`[RA API] Fetched progress for ${username}: ${completed}/${numAchievements} achievements`);
            } catch (error) {
                console.error(`[RA API] Error fetching data for ${username}:`, error);
                usersProgress.push({
                    username,
                    profileImage: `https://retroachievements.org/UserPic/${username}.png`,
                    profileUrl: `https://retroachievements.org/user/${username}`,
                    completedAchievements: 0,
                    totalAchievements: 0,
                    completionPercentage: 0,
                    hasCompletion: false,
                    achievements: []
                });
            }
        }

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

module.exports = {
    fetchUserProfile,
    fetchLeaderboardData,
};

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const database = require('./database');

const userProfileCache = new Map();

async function fetchUserProfile(username) {
    const cachedProfile = userProfileCache.get(username);
    if (cachedProfile && (Date.now() - cachedProfile.timestamp) < 3600000) { // 1-hour TTL
        return cachedProfile.data;
    }

    try {
        const params = new URLSearchParams({
            z: process.env.RA_USERNAME,
            y: process.env.RA_API_KEY,
            u: username
        });
        const url = `https://retroachievements.org/API/API_GetUserSummary.php?${params}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch user profile for ${username}: ${response.statusText}`);
        }

        const data = await response.json();
        const profile = {
            username: data.Username,
            profileImage: `https://retroachievements.org${data.UserPic}`,
            profileUrl: `https://retroachievements.org/user/${data.Username}`
        };

        userProfileCache.set(username, { data: profile, timestamp: Date.now() });
        return profile;
    } catch (error) {
        console.error(`Error fetching user profile for ${username}:`, error);
        return {
            username,
            profileImage: `https://retroachievements.org/UserPic/${username}.png`,
            profileUrl: `https://retroachievements.org/user/${username}`
        };
    }
}

async function fetchLeaderboardData() {
    try {
        const challenge = await database.getCurrentChallenge();
        if (!challenge || !challenge.gameId) {
            throw new Error('No active challenge found in database');
        }

        const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRt6MiNALBT6jj0hG5qtalI_GkSkXFaQvWdRj-Ye-l3YNU4DB5mLUQGHbLF9-XnhkpJjLEN9gvTHXmp/pub?gid=0&single=true&output=csv';

        const csvResponse = await fetch(SPREADSHEET_URL);
        const csvText = await csvResponse.text();
        const users = csvText.split('\n').slice(1).map(line => line.trim()).filter(line => line);

        const usersProgress = [];
        for (const username of users) {
            await delay(300); // Rate limiting
            try {
                const params = new URLSearchParams({
                    z: process.env.RA_USERNAME,
                    y: process.env.RA_API_KEY,
                    g: challenge.gameId,
                    u: username
                });
                const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
                const response = await fetch(url);
                const data = await response.json();

                const profile = await fetchUserProfile(username);
                const numAchievements = data.Achievements ? Object.keys(data.Achievements).length : 0;
                const completed = data.Achievements ? Object.values(data.Achievements).filter(ach => parseInt(ach.DateEarned) > 0).length : 0;

                usersProgress.push({
                    username,
                    profileImage: profile.profileImage,
                    profileUrl: profile.profileUrl,
                    completedAchievements: completed,
                    totalAchievements: numAchievements,
                    completionPercentage: numAchievements > 0 ? ((completed / numAchievements) * 100).toFixed(2) : "0.00"
                });
            } catch (error) {
                console.error(`Error fetching data for ${username}:`, error);
                usersProgress.push({
                    username,
                    profileImage: `https://retroachievements.org/UserPic/${username}.png`,
                    profileUrl: `https://retroachievements.org/user/${username}`,
                    completedAchievements: 0,
                    totalAchievements: 0,
                    completionPercentage: 0
                });
            }
        }

        return {
            leaderboard: usersProgress.sort((a, b) => b.completionPercentage - a.completionPercentage),
            gameInfo: challenge,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
        throw error;
    }
}

module.exports = {
    fetchUserProfile,
    fetchLeaderboardData,
};

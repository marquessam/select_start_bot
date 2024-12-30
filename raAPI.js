const fetch = require('node-fetch');
const database = require('./database');

const API_KEY = process.env.RA_API_KEY;
const API_USER = process.env.RA_USER;
const API_BASE_URL = 'https://retroachievements.org/API';

async function fetchLeaderboardData() {
    try {
        // Get current challenge from database instead of file
        const currentChallenge = await database.getCurrentChallenge();
        
        if (!currentChallenge || !currentChallenge.gameId) {
            throw new Error('No active challenge found');
        }

        const endpoint = `${API_BASE_URL}/API_GetGameInfoAndUserProgress.php`;
        const params = new URLSearchParams({
            z: API_USER,
            y: API_KEY,
            u: API_USER,
            g: currentChallenge.gameId
        });

        const response = await fetch(`${endpoint}?${params}`);
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const gameData = await response.json();

        // Fetch achievement list for the game
        const achievementsEndpoint = `${API_BASE_URL}/API_GetGameInfoExtended.php`;
        const achievementsParams = new URLSearchParams({
            z: API_USER,
            y: API_KEY,
            g: currentChallenge.gameId
        });

        const achievementsResponse = await fetch(`${achievementsEndpoint}?${achievementsParams}`);
        if (!achievementsResponse.ok) {
            throw new Error(`Achievements API request failed with status ${achievementsResponse.status}`);
        }

        const achievementsData = await achievementsResponse.json();
        const totalAchievements = Object.keys(achievementsData.Achievements || {}).length;

        // Fetch user list
        const userList = gameData && gameData.UserCompletion ? gameData.UserCompletion : [];

        // Process users
        const leaderboard = userList.map(user => ({
            username: user.User,
            completedAchievements: user.NumAwarded,
            totalAchievements: totalAchievements,
            completionPercentage: ((user.NumAwarded / totalAchievements) * 100).toFixed(1),
            profileUrl: `https://retroachievements.org/user/${user.User}`,
            profileImage: `https://retroachievements.org${user.UserPic}`
        }));

        return {
            gameInfo: {
                ...gameData,
                ImageIcon: gameData.ImageIcon || currentChallenge.gameIcon
            },
            leaderboard: leaderboard.sort((a, b) => b.completedAchievements - a.completedAchievements)
        };
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

module.exports = { fetchLeaderboardData };
    fetchLeaderboardData,
    fetchNominations 
};

const fetch = require('node-fetch');
const database = require('./database');

const API_KEY = process.env.RA_API_KEY;
const API_USER = process.env.RA_USER;
const API_BASE_URL = 'https://retroachievements.org/API';

async function fetchLeaderboardData() {
    try {
        // Get current challenge from database instead of file
        const currentChallenge = await database.getCurrentChallenge();
        console.log('Current challenge data:', currentChallenge);
        
        if (!currentChallenge || !currentChallenge.gameId) {
            console.log('No game ID found in current challenge');
            // Return dummy data if no challenge is set
            return {
                gameInfo: {
                    ImageIcon: '/path/to/default/icon',
                },
                leaderboard: [{
                    username: 'No Active Challenge',
                    completedAchievements: 0,
                    totalAchievements: 0,
                    completionPercentage: '0.0',
                    profileUrl: '#',
                    profileImage: '/path/to/default/profile'
                }]
            };
        }

        console.log('Fetching game info for ID:', currentChallenge.gameId);
        const endpoint = `${API_BASE_URL}/API_GetGameInfoAndUserProgress.php`;
        const params = new URLSearchParams({
            z: API_USER,
            y: API_KEY,
            u: API_USER,
            g: currentChallenge.gameId
        });

        const response = await fetch(`${endpoint}?${params}`);
        console.log('Game info API response status:', response.status);
        if (!response.ok) {
            throw new Error(`Game info API request failed with status ${response.status}`);
        }

        const gameData = await response.json();
        console.log('Game data received:', gameData ? 'yes' : 'no');

        // Fetch achievement list for the game
        console.log('Fetching achievements data...');
        const achievementsEndpoint = `${API_BASE_URL}/API_GetGameInfoExtended.php`;
        const achievementsParams = new URLSearchParams({
            z: API_USER,
            y: API_KEY,
            g: currentChallenge.gameId
        });

        const achievementsResponse = await fetch(`${achievementsEndpoint}?${achievementsParams}`);
        console.log('Achievements API response status:', achievementsResponse.status);
        if (!achievementsResponse.ok) {
            console.error('Achievement API error. Full URL:', `${achievementsEndpoint}?${achievementsParams}`);
            throw new Error(`Achievements API request failed with status ${achievementsResponse.status}`);
        }

        const achievementsData = await achievementsResponse.json();
        const totalAchievements = Object.keys(achievementsData.Achievements || {}).length;
        console.log('Total achievements found:', totalAchievements);

        // Fetch user list
        const userList = gameData && gameData.UserCompletion ? gameData.UserCompletion : [];
        console.log('Number of users found:', userList.length);

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
        // Return dummy data in case of error
        return {
            gameInfo: {
                ImageIcon: '/path/to/default/icon',
            },
            leaderboard: [{
                username: error.message || 'Error fetching data',
                completedAchievements: 0,
                totalAchievements: 0,
                completionPercentage: '0.0',
                profileUrl: '#',
                profileImage: '/path/to/default/profile'
            }]
        };
    }
}

module.exports = {
    fetchLeaderboardData
};

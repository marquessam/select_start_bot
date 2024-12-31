const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const database = require('./database');

async function fetchNominations() {
    try {
        const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTSpV_1nLVtIVvXtNVqpzqXV6NQVi8l6pm5wQR41tYm7ooAmxfH0ln__TuEcC9so6KFRanFW0yCiJOM/pub?output=csv';
        
        console.log('Fetching nominations from:', SPREADSHEET_URL);
        const response = await fetch(SPREADSHEET_URL);
        console.log('Response status:', response.status);
        
        const csvText = await response.text();
        console.log('CSV content (first 100 chars):', csvText.substring(0, 100));
        
        const nominations = csvText
            .split('\n')
            .slice(1)
            .map(line => {
                console.log('Processing line:', line);
                const [gameTitle, platform] = line.trim().split(',').map(item => item.trim());
                return { platform, game: gameTitle };
            })
            .filter(nom => nom.platform && nom.game);

        console.log('Processed nominations:', nominations);

        const groupedNominations = nominations.reduce((groups, nom) => {
            if (!groups[nom.platform]) {
                groups[nom.platform] = [];
            }
            groups[nom.platform].push(nom.game);
            return groups;
        }, {});

        console.log('Grouped nominations:', groupedNominations);

        return groupedNominations;
    } catch (error) {
        console.error('Detailed nominations error:', error);
        throw error;
    }
}

async function fetchLeaderboardData() {
    try {
        // Get current challenge from database instead of file
        const challenge = await database.getCurrentChallenge();
        if (!challenge || !challenge.gameId) {
            throw new Error('No active challenge found in database');
        }

        const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRt6MiNALBT6jj0hG5qtalI_GkSkXFaQvWdRj-Ye-l3YNU4DB5mLUQGHbLF9-XnhkpJjLEN9gvTHXmp/pub?gid=0&single=true&output=csv';

        // Fetch users from spreadsheet
        const csvResponse = await fetch(SPREADSHEET_URL);
        const csvText = await csvResponse.text();
        const users = csvText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line)
            .slice(1);

        let validGameInfo = null;
        const usersProgress = [];

        for (const username of users) {
            try {
                await delay(300);

                const params = new URLSearchParams({
                    z: process.env.RA_USERNAME,
                    y: process.env.RA_API_KEY,
                    g: challenge.gameId,  // Updated to use database structure
                    u: username
                });

                const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();

                if (!validGameInfo && data.Title && data.ImageIcon) {
                    validGameInfo = {
                        Title: data.Title,
                        ImageIcon: data.ImageIcon
                    };
                }

                const numAchievements = data.Achievements ? Object.keys(data.Achievements).length : 0;
                const completed = data.Achievements ? 
                    Object.values(data.Achievements).filter(ach => parseInt(ach.DateEarned) > 0).length : 0;
                const completionPct = numAchievements > 0 ? ((completed / numAchievements) * 100).toFixed(2) : "0.00";

                usersProgress.push({
                    username,
                    profileImage: `https://retroachievements.org/UserPic/${username}.png`,
                    profileUrl: `https://retroachievements.org/user/${username}`,
                    completedAchievements: completed,
                    totalAchievements: numAchievements,
                    completionPercentage: parseFloat(completionPct) || 0
                });
            } catch (error) {
                console.error(`Error fetching data for ${username}:`, error);
            }
        }
        
        const sortedUsers = usersProgress
            .filter(user => !user.error)
            .sort((a, b) => b.completionPercentage - a.completionPercentage);

        const topTen = sortedUsers.slice(0, 10);
        const additionalParticipants = sortedUsers.slice(10).map(user => user.username);

        return {
            gameInfo: validGameInfo || { 
                Title: challenge.gameName,
                ImageIcon: challenge.gameIcon
            },
            leaderboard: topTen,
            additionalParticipants: additionalParticipants,
            lastUpdated: new Date().toISOString()
        };

    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

module.exports = { 
    fetchLeaderboardData,
    fetchNominations 
};

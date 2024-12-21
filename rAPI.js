const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  console.log('API request started');
  
  try {
    const { gameId } = req.query;
    console.log('Game ID:', gameId);

    const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRt6MiNALBT6jj0hG5qtalI_GkSkXFaQvWdRj-Ye-l3YNU4DB5mLUQGHbLF9-XnhkpJjLEN9gvTHXmp/pub?gid=0&single=true&output=csv';

    // Fetch users from spreadsheet
    console.log('Fetching users from spreadsheet...');
    const csvResponse = await fetch(SPREADSHEET_URL);
    const csvText = await csvResponse.text();
    const users = csvText
        .split('\n')              // Split into lines
        .map(line => line.trim()) // Remove whitespace
        .filter(line => line)     // Remove empty lines
        .slice(1);                // Remove header row if present
    
    console.log('Fetched users:', users);
    
    if (!process.env.RA_API_KEY || !process.env.RA_USERNAME) {
      throw new Error('Missing environment variables');
    }

    console.log('Starting user data fetch');
    let validGameInfo = null;
    const usersProgress = [];

    for (const username of users) {
      try {
        console.log(`Fetching data for ${username}`);
        await delay(300);

        const params = new URLSearchParams({
          z: process.env.RA_USERNAME,
          y: process.env.RA_API_KEY,
          g: gameId,
          u: username
        });

        const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Successfully fetched data for ${username}`);

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
        usersProgress.push({
          username,
          profileImage: `https://retroachievements.org/UserPic/${username}.png`,
          profileUrl: `https://retroachievements.org/user/${username}`,
          completedAchievements: 0,
          totalAchievements: 0,
          completionPercentage: 0,
          error: true
        });
      }
    }

    console.log('Finished fetching all user data');
    
    // Sort users and split into top 10 and others
    const sortedUsers = usersProgress
      .filter(user => !user.error)
      .sort((a, b) => b.completionPercentage - a.completionPercentage);

    const topTen = sortedUsers.slice(0, 10);
    const additionalParticipants = sortedUsers.slice(10).map(user => user.username);

    const response = {
      gameInfo: validGameInfo || { 
        Title: "Final Fantasy Tactics: The War of the Lions",
        ImageIcon: "/Images/017657.png"
      },
      leaderboard: topTen,
      additionalParticipants: additionalParticipants,
      lastUpdated: new Date().toISOString()
    };

    console.log('Sending response');
    return res.status(200).json(response);

  } catch (error) {
    console.error('Detailed API Error:', {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name
    });
    return res.status(500).json({ 
      error: 'Failed to fetch leaderboard data', 
      details: error.message,
      type: error.constructor.name
    });
  }
};

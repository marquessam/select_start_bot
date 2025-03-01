// commands/challenge.js
const { EmbedBuilder } = require('discord.js');
const database = require('../database');
const { monthlyGames } = require('../monthlyGames'); // Import your config

module.exports = {
    name: 'challenge',
    description: 'Shows current monthly challenge and shadow game status',
    async execute(message, args, { shadowGame }) {
        try {
            // Get current date and format as YYYY-MM
            const today = new Date();
            const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            
            // First get the current challenge from database
            let currentChallenge = await database.getCurrentChallenge();
            
            // Check if the challenge's month matches current month
            const challengeMonth = currentChallenge?.startDate?.substring(0, 7);
            
            // If the months don't match and we have data for the current month, update it
            if (challengeMonth !== currentMonthKey && monthlyGames[currentMonthKey]) {
                // Log that we're updating the challenge
                console.log(`Updating challenge from ${challengeMonth} to ${currentMonthKey}`);
                
                // Get the new monthly game data
                const gameData = monthlyGames[currentMonthKey].monthlyGame;
                
                // Create challenge data object for database
                const challengeData = {
                    gameId: gameData.id,
                    gameName: gameData.name,
                    gameIcon: `/Images/game/${gameData.id}.png`,
                    startDate: `${currentMonthKey}-01`,
                    endDate: getLastDayOfMonth(today),
                    rules: [
                        `Complete ${gameData.requireProgression ? 'all' : 'any'} progression achievements`,
                        `Complete ${gameData.requireAllWinConditions ? 'all' : 'any'} win condition achievements`,
                        gameData.allowMastery ? 'Mastery available for additional points' : 'No mastery bonus available'
                    ]
                };
                
                // Save the new challenge to database
                await database.saveCurrentChallenge(challengeData);
                
                // Also update shadow game if it exists
                if (monthlyGames[currentMonthKey].shadowGame) {
                    const shadowData = monthlyGames[currentMonthKey].shadowGame;
                    await database.saveShadowGame({
                        active: true,
                        revealed: false, // Initially hidden
                        finalReward: {
                            gameId: shadowData.id,
                            gameName: shadowData.name,
                            platform: getShadowGamePlatform(shadowData.id), // Helper function to get platform
                            points: 4 // Default points (1 for participation + 3 for completion)
                        }
                    });
                }
                
                // Get the updated challenge from database
                currentChallenge = await database.getCurrentChallenge();
            }
            
            // Get shadow game data
            const shadowGameData = await database.getShadowGame();

            // Create embed for display
            const embed = new EmbedBuilder()
                .setColor('#32CD32')  // Lime green color
                .setTitle('CURRENT CHALLENGES')
                .setDescription('**[DATABASE ACCESS GRANTED]**');

            // Add monthly challenge info
            if (currentChallenge && currentChallenge.gameId) {
                let challengeText = 
                    `**GAME:** "${currentChallenge.gameName}"\n` +
                    `**DATES:** ${currentChallenge.startDate} to ${currentChallenge.endDate}\n\n` +
                    `**POINTS AVAILABLE:**\n` +
                    `- Participation: 1 point\n` +
                    `- Game Completion: 3 points\n` +
                    `- Mastery: 3 points\n\n` +
                    `**RULES:**\n${currentChallenge.rules.map(rule => `- ${rule}`).join('\n')}`;
                
                embed.addFields({ name: 'MONTHLY CHALLENGE', value: challengeText });

                if (currentChallenge.gameIcon) {
                    embed.setThumbnail(`https://retroachievements.org${currentChallenge.gameIcon}`);
                }
            } else {
                embed.addFields({ name: 'MONTHLY CHALLENGE', value: 'No active challenge found' });
            }

            // Shadow game display based on revealed status
            if (shadowGameData && shadowGameData.revealed) {
                // Shadow game is unlocked - show the game info
                let shadowText = 
                    `**GAME:** ${shadowGameData.finalReward.gameName} (${shadowGameData.finalReward.platform})\n\n` +
                    `**POINTS AVAILABLE:**\n` +
                    `- Participation: 1 point\n` +
                    `- Completion: 3 points\n\n` +
                    `This challenge runs parallel to your current quest.`;
                
                embed.addFields({ name: 'SHADOW CHALLENGE UNLOCKED', value: shadowText });
            } else {
                // Shadow game is hidden
                let shadowText = 
                    `*An ancient power stirs in the shadows...*\n` +
                    `*But its presence remains hidden.*\n\n` +
                    `Use \`!shadowgame\` to attempt to unveil the challenge.`;
                
                embed.addFields({ name: 'SHADOW CHALLENGE', value: shadowText });
            }

            embed.setFooter({ text: `TERMINAL_ID: ${generateTerminalId()}` });
            embed.setTimestamp();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Challenge Command Error:', error);
            await message.channel.send('**[ERROR]** Failed to retrieve challenge data');
        }
    }
};

// Helper function to generate a random terminal ID
function generateTerminalId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 7; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Helper function to get the last day of the month
function getLastDayOfMonth(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// Helper function to get platform for shadow games
function getShadowGamePlatform(gameId) {
    // This function would ideally get the platform from your game database
    // For now, we're using a simple mapping of known IDs or default to "RetroAchievements"
    const platformMap = {
        "7181": "Game Boy Advance", // Monster Rancher Advance 2
        "274": "SNES", // U.N. Squadron
        "10024": "N64" // Mario Tennis
    };
    
    return platformMap[gameId] || "RetroAchievements";
}

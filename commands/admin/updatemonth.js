// commands/admin/updatemonth.js
const TerminalEmbed = require('../../utils/embedBuilder');
const { monthlyGames } = require('../../monthlyGames');

module.exports = {
    name: 'updatemonth',
    description: 'Update to the current month\'s games',
    async execute(message, args, { shadowGame }) {
        try {
            const embed = new TerminalEmbed()
                .setTerminalTitle('MONTH UPDATE')
                .setTerminalDescription('[PROCESSING UPDATE]')
                .addTerminalField('STATUS', 'Starting update to current month...');

            const statusMessage = await message.channel.send({ embeds: [embed] });

            // 1. Get current month and year
            const now = new Date();
            const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            
            // Check if we have games defined for this month
            if (!monthlyGames[currentMonthKey]) {
                embed.setTerminalDescription('[UPDATE FAILED]')
                    .addTerminalField('ERROR', 
                        `No games defined for month key: ${currentMonthKey}\n` +
                        'Check monthlyGames.js configuration');
                
                await statusMessage.edit({ embeds: [embed] });
                return;
            }

            // 2. Update embed with current info
            embed.addTerminalField('MONTH', 
                `Updating to: ${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}\n` +
                `Month Key: ${currentMonthKey}`);
            
            await statusMessage.edit({ embeds: [embed] });

            // 3. Get the game data for current month
            const currentGames = monthlyGames[currentMonthKey];
            const mainGame = currentGames.monthlyGame;
            const shadowGameData = currentGames.shadowGame;

            // 4. Update current challenge in database
            embed.addTerminalField('MONTHLY GAME', 
                `Updating to: ${mainGame.name} (ID: ${mainGame.id})`);
            
            await statusMessage.edit({ embeds: [embed] });

            // Create challenge data object
            const challengeData = {
                gameId: mainGame.id,
                gameName: mainGame.name,
                gameIcon: `https://media.retroachievements.org/Images/056204.png`,
                startDate: `${currentMonthKey}-01`,
                endDate: getLastDayOfMonth(now),
                rules: [
                    `Complete ${mainGame.requireProgression ? 'all' : 'any'} progression achievements`,
                    `Complete ${mainGame.requireAllWinConditions ? 'all' : 'any'} win condition achievements`,
                    mainGame.allowMastery ? 'Mastery available for additional points' : 'No mastery bonus available'
                ],
                points: {
                    first: 5,
                    second: 3,
                    third: 2
                }
            };

            // Save to database
            await message.client.database.saveCurrentChallenge(challengeData);

            // 5. Update shadow game in database
            embed.addTerminalField('SHADOW GAME', 
                `Updating to: ${shadowGameData.name} (ID: ${shadowGameData.id})`);
            
            await statusMessage.edit({ embeds: [embed] });

            // Create shadow game data
            const shadowData = {
                active: true,
                revealed: false,
                expectedGameName: shadowGameData.name,
                finalReward: {
                    gameId: shadowGameData.id,
                    gameName: shadowGameData.name,
                    platform: getShadowGamePlatform(shadowGameData.id),
                    points: {
                        participation: 1,
                        beaten: 3
                    }
                }
            };

            // Save to database
            await message.client.database.saveShadowGame(shadowData);

            // 6. Force refresh leaderboards
            embed.addTerminalField('CACHE', 'Refreshing leaderboard cache...');
            await statusMessage.edit({ embeds: [embed] });

            if (global.leaderboardCache) {
                await global.leaderboardCache.refreshLeaderboard();
            } else {
                embed.addTerminalField('WARNING', 'Leaderboard cache not available');
                await statusMessage.edit({ embeds: [embed] });
            }

            // 7. Complete
            embed.setTerminalDescription('[UPDATE COMPLETED]')
                .addTerminalField('NEXT STEPS', 
                    'Use !leaderboard month to verify the update\n' +
                    'If issues persist, try running this command again');
            
            embed.setTerminalFooter();
            await statusMessage.edit({ embeds: [embed] });

        } catch (error) {
            console.error('Month update error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to update month\n[Ready for input]█\x1b[0m```');
        }
    }
};

// Helper function to get the last day of the month
function getLastDayOfMonth(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// Helper function to get platform for shadow games
function getShadowGamePlatform(gameId) {
    const platformMap = {
        "8181": "Game Boy Advance", // Monster Rancher Advance 2
        "7181": "Game Boy Advance", // Monster Rancher Advance 2
        "274": "SNES", // U.N. Squadron
        "10024": "N64" // Mario Tennis
    };
    
    return platformMap[gameId] || "RetroAchievements";
}

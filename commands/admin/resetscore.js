// commands/admin/resetscore.js
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'resetscore',
    description: 'Reset scores for an arcade game',
    async execute(message, args) {
        try {
            if (args.length < 1) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !resetscore <game_number> [username]\nExample: !resetscore 4       (resets all Ms. Pac-Man scores)\nExample: !resetscore 4 username (removes specific user\'s score)\n[Ready for input]█\x1b[0m```');
                return;
            }

            const gameNum = parseInt(args[0]);
            const username = args[1]?.toLowerCase();  // Optional username

            // Get arcade data
            const arcadeData = await database.getArcadeScores();
            const games = Object.entries(arcadeData.games);

            if (gameNum < 1 || gameNum > games.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number. Use !arcade to see available games\n[Ready for input]█\x1b[0m```');
                return;
            }

            const [gameName, gameData] = games[gameNum - 1];
            const oldScores = [...(gameData.scores || [])];

            if (username) {
                // Remove specific user's score
                await database.removeArcadeScore(gameName, username);
            } else {
                // Reset all scores for the game
                await database.resetArcadeScores(gameName);
            }

            // Get updated data
            const updatedData = await database.getArcadeScores();
            const updatedScores = updatedData.games[gameName].scores;

            const embed = new TerminalEmbed()
                .setTerminalTitle(`${gameName} - SCORES RESET`)
                .setTerminalDescription('[UPDATE COMPLETE]\n[DISPLAYING CHANGES]')
                .addTerminalField('ACTION TAKEN', 
                    username ? `Removed score for user: ${username}` : 'Reset all scores for game');

            if (oldScores.length > 0) {
                embed.addTerminalField('PREVIOUS RANKINGS',
                    oldScores.map((score, index) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        return `${medals[index]} ${score.username}: ${score.score.toLocaleString()}`;
                    }).join('\n') || 'No scores recorded'
                );
            }

            embed.addTerminalField('CURRENT RANKINGS',
                updatedScores.length > 0 ? 
                    updatedScores.map((score, index) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        return `${medals[index]} ${score.username}: ${score.score.toLocaleString()}`;
                    }).join('\n') :
                    'No scores recorded'
            );

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !arcade to verify changes\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Reset Score Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reset scores\n[Ready for input]█\x1b[0m```');
        }
    }
};

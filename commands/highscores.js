// highscores.js (updated version)
const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

module.exports = {
    name: 'highscores',
    description: 'Displays current high score rankings',
    async execute(message, args) {
        try {
            const highscores = await database.getHighScores();
            
            // If no specific game is provided, show the game list
            if (!args.length) {
                await message.channel.send('```ansi\n\x1b[32m> Accessing high score database...\x1b[0m\n```');
                
                const embed = new TerminalEmbed()
                    .setTerminalTitle('HIGH SCORE BOARDS')
                    .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[SELECT A GAME TO VIEW RANKINGS]\n[EXPIRES: DECEMBER 1ST 2025]');

                // Create a numbered list of games
                const gamesList = Object.entries(highscores.games)
                    .map(([gameName, gameData], index) => {
                        const hasScores = gameData.scores.length > 0 ? '✓' : ' ';
                        return `${index + 1}. ${gameName} (${gameData.platform}) ${hasScores}`;
                    })
                    .join('\n');

                embed.addTerminalField(
                    'AVAILABLE GAMES',
                    gamesList + '\n\n✓ = Scores recorded'
                );

                embed.addTerminalField(
                    'USAGE',
                    '!highscores <game number>\nExample: !highscores 1'
                );

                embed.setTerminalFooter();
                
                await message.channel.send({ embeds: [embed] });
                await message.channel.send('```ansi\n\x1b[32m> Enter game number to view rankings\n[Ready for input]█\x1b[0m```');
                return;
            }

            // If a game number is provided
            const gameNumber = parseInt(args[0]);
            const games = Object.entries(highscores.games);

            if (isNaN(gameNumber) || gameNumber < 1 || gameNumber > games.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\nUse !highscores to see available games\n[Ready for input]█\x1b[0m```');
                return;
            }

            const [gameName, gameData] = games[gameNumber - 1];

            const embed = new TerminalEmbed()
                .setTerminalTitle(`${gameName} HIGH SCORES`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING RANKINGS]');

            if (gameData.scores.length > 0) {
                const scoreText = gameData.scores
                    .map((score, index) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        return `${medals[index]} ${score.username}: ${score.score}`;
                    })
                    .join('\n');
                
                embed.addTerminalField(
                    `RANKINGS (${gameData.platform})`,
                    scoreText
                );
            } else {
                embed.addTerminalField(
                    `STATUS (${gameData.platform})`,
                    'No scores recorded yet'
                );
            }

            embed.addTerminalField(
                'POINTS AWARDED',
                '1st Place: 3 points\n2nd Place: 2 points\n3rd Place: 1 point'
            );

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Submit scores with screenshot proof\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('High Scores Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve high scores\n[Ready for input]█\x1b[0m```');
        }
    }
};

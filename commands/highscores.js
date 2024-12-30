const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'highscore',
    aliases: ['highscores'],
    description: 'Displays current high score rankings',
    async execute(message, args) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing high score database...\x1b[0m\n```');
            
            const highscores = await database.getHighScores();
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('HIGH SCORE RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]\n[EXPIRES: DECEMBER 1ST 2025]');

            // Display each game's rankings
            for (const [gameName, gameData] of Object.entries(highscores.games)) {
                if (gameData.scores.length > 0) {
                    const scoreText = gameData.scores
                        .map((score, index) => {
                            const medals = ['🥇', '🥈', '🥉'];
                            return `${medals[index]} ${score.username}: ${score.score}`;
                        })
                        .join('\n');
                    
                    embed.addTerminalField(
                        `${gameName} (${gameData.platform})`,
                        scoreText || 'No scores recorded'
                    );
                }
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

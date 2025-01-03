// commands/arcade.js
const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

module.exports = {
    name: 'arcade',
    description: 'Display arcade challenge games and scores',
    async execute(message, args) {
        try {
            const arcadeData = await database.getArcadeScores();

            if (args.length === 0) {
                // Show game list
                const gameList = Object.entries(arcadeData.games)
                    .map(([name, game], index) => {
                        const hasScores = game.scores.length > 0 ? '✓' : ' ';
                        return `${index + 1}. ${name} (${game.platform}) ${hasScores}`;
                    })
                    .join('\n');

             const embed = new TerminalEmbed()
                    .setTerminalTitle('ARCADE CHALLENGE')
                    .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[SELECT A GAME TO VIEW RANKINGS]\n[EXPIRES: ' + arcadeData.expiryDate + ']')
                    .addTerminalField('SUBMISSION REQUIREMENTS', 'All high scores must be verified with screenshot evidence posted in the screenshot-submissions channel.')
                    .addTerminalField('AVAILABLE GAMES', gameList + '\n\n✓ = Scores recorded')
                    .addTerminalField('USAGE', '!arcade <game number>\nExample: !arcade 1')
                    .setTerminalFooter();

                await message.channel.send({ embeds: [embed] });
                return;
            }

            // Show specific game scores
            const gameNum = parseInt(args[0]);
            const games = Object.entries(arcadeData.games);
            
            if (isNaN(gameNum) || gameNum < 1 || gameNum > games.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```');
                return;
            }

            const [gameName, gameData] = games[gameNum - 1];
            const scoreList = gameData.scores.length > 0 ?
                gameData.scores
                    .map((score, index) => `${['🥇', '🥈', '🥉'][index]} ${score.username}: ${score.score.toLocaleString()}`)
                    .join('\n') :
                'No scores recorded';

            const embed = new TerminalEmbed()
                .setTerminalTitle(`${gameName} RANKINGS`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]')
                .addTerminalField('GAME INFO', 
                    `PLATFORM: ${gameData.platform}\n` +
                    `RULES: ${gameData.description}`)
                .addTerminalField('HIGH SCORES', scoreList)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Arcade Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve arcade data\n[Ready for input]█\x1b[0m```');
        }
    }
};

// commands/admin/resetscore.js
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'resetscore',
    description: 'Reset arcade high scores',
    async execute(message, args) {
        try {
            if (args.length < 1) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !resetscore <game_number> [username]\n[Ready for input]█\x1b[0m```');
                return;
            }

            const gameNum = parseInt(args[0]);
            const username = args[1]?.toLowerCase();

            const arcadeScores = await database.getArcadeScores();
            const gameList = Object.keys(arcadeScores.games);

            if (gameNum < 1 || gameNum > gameList.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\nUse !arcade to see available games\n[Ready for input]█\x1b[0m```');
                return;
            }

            const gameName = gameList[gameNum - 1];
            const previousScores = [...arcadeScores.games[gameName].scores];

            if (username) {
                await database.removeArcadeScore(gameName, username);
            } else {
                await database.resetArcadeScores(gameName);
            }

            const updatedScores = (await database.getArcadeScores()).games[gameName].scores;

            const embed = new TerminalEmbed()
                .setTerminalTitle(`${gameName} - SCORES RESET`)
                .setTerminalDescription('[UPDATE SUCCESSFUL]')
                .addTerminalField('ACTION',
                    username ? 
                    `Removed score for: ${username}` :
                    'Reset all scores')
                .addTerminalField('PREVIOUS RANKINGS',
                    previousScores.length > 0 ?
                    previousScores.map((s, i) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        return `${medals[i] || ''} ${s.username}: ${s.score.toLocaleString()}`;
                    }).join('\n') :
                    'No previous scores')
                .addTerminalField('CURRENT RANKINGS',
                    updatedScores.length > 0 ?
                    updatedScores.map((s, i) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        return `${medals[i] || ''} ${s.username}: ${s.score.toLocaleString()}`;
                    }).join('\n') :
                    'No scores recorded')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Reset Score Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reset scores\n[Ready for input]█\x1b[0m```');
        }
    }
};

// commands/admin/addhighscore.js
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'addhighscore',
    description: 'Add or update arcade high scores',
    async execute(message, args) {
        try {
            if (args.length < 3) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !addhighscore <game_number> <username> <score>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const [gameNum, username, scoreStr] = args;
            const score = parseInt(scoreStr.replace(/,/g, ''));

            if (isNaN(score) || score < 0) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid score value\n[Ready for input]█\x1b[0m```');
                return;
            }

            const arcadeScores = await database.getArcadeScores();
            const gameList = Object.keys(arcadeScores.games);
            const gameIndex = parseInt(gameNum) - 1;

            if (gameIndex < 0 || gameIndex >= gameList.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\nUse !arcade to see available games\n[Ready for input]█\x1b[0m```');
                return;
            }

            const gameName = gameList[gameIndex];
            const previousScores = [...arcadeScores.games[gameName].scores];
            const updatedScores = await database.saveArcadeScore(gameName, username, score);

            const embed = new TerminalEmbed()
                .setTerminalTitle('HIGH SCORE ADDED')
                .setTerminalDescription('[UPDATE SUCCESSFUL]')
                .addTerminalField('DETAILS',
                    `GAME: ${gameName}\n` +
                    `USER: ${username}\n` +
                    `SCORE: ${score.toLocaleString()}`)
                .addTerminalField('PREVIOUS RANKINGS',
                    previousScores.length > 0 ?
                    previousScores.map((s, i) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        return `${medals[i] || ''} ${s.username}: ${s.score.toLocaleString()}`;
                    }).join('\n') :
                    'No previous scores')
                .addTerminalField('NEW RANKINGS',
                    updatedScores.map((s, i) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        return `${medals[i] || ''} ${s.username}: ${s.score.toLocaleString()}`;
                    }).join('\n'))
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Add High Score Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to add high score\n[Ready for input]█\x1b[0m```');
        }
    }
};

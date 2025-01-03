// commands/admin/addscore.js
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'addscore',
    description: 'Add score to arcade challenge',
    async execute(message, args) {
        if (args.length < 3) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Usage: !addscore <game_number> <username> <score>\n[Ready for input]█\x1b[0m```');
            return;
        }

        try {
            const gameNum = parseInt(args[0]);
            const username = args[1].toLowerCase();
            const score = parseInt(args[2]);

            const scores = await database.getArcadeScores();
            const games = Object.keys(scores.games);

            if (isNaN(gameNum) || gameNum < 1 || gameNum > games.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```');
                return;
            }

            const gameName = games[gameNum - 1];
            const success = await database.updateArcadeScore(gameName, username, score);

            if (success) {
                const updatedScores = await database.getArcadeScores();
                const gameScores = updatedScores.games[gameName].scores;

                const embed = new TerminalEmbed()
                    .setTerminalTitle(`${gameName} - SCORE UPDATED`)
                    .setTerminalDescription('[UPDATE COMPLETE]\n[DISPLAYING NEW RANKINGS]')
                    .addTerminalField('CURRENT RANKINGS',
                        gameScores.map((s, i) => 
                            `${['🥇', '🥈', '🥉'][i]} ${s.username}: ${s.score.toLocaleString()}`
                        ).join('\n') || 'No scores recorded')
                    .setTerminalFooter();

                await message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Add Score Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to add score\n[Ready for input]█\x1b[0m```');
        }
    }
};

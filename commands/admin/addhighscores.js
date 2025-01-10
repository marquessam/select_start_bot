import TerminalEmbed from '../utils/embedBuilder.js';
import database from '../../database.js';

export default {
    name: 'addhighscore',
    description: 'Add or update high scores',
    async execute(message, args) {
        try {
            // Check admin permissions
            const hasPermission = message.member && (
                message.member.permissions.has('Administrator') ||
                message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)
            );

            if (!hasPermission) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Get current arcade scores
            const arcadeScores = await database.getArcadeScores();
            const filter = m => m.author.id === message.author.id;
            const timeout = 30000;

            // Show game list
            const gameList = Object.keys(arcadeScores.games)
                .map((name, index) => `${index + 1}. ${name}`)
                .join('\n');

            await message.channel.send('```ansi\n\x1b[32mAvailable Games:\n' + gameList + '\n\nEnter the game number:\x1b[0m```');

            // Get game selection
            let gameResponse;
            try {
                gameResponse = await message.channel.awaitMessages({
                    filter,
                    max: 1,
                    time: timeout,
                    errors: ['time']
                });
            } catch (error) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired. Please start over.\n[Ready for input]█\x1b[0m```');
                return;
            }

            const gameNum = parseInt(gameResponse.first().content);
            if (isNaN(gameNum) || gameNum < 1 || gameNum > Object.keys(arcadeScores.games).length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```');
                return;
            }
            const gameName = Object.keys(arcadeScores.games)[gameNum - 1];

            // Get username
            await message.channel.send('```ansi\n\x1b[32mEnter the username:\x1b[0m```');
            let userResponse;
            try {
                userResponse = await message.channel.awaitMessages({
                    filter,
                    max: 1,
                    time: timeout,
                    errors: ['time']
                });
            } catch (error) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired. Please start over.\n[Ready for input]█\x1b[0m```');
                return;
            }
            const username = userResponse.first().content;

            // Get score
            await message.channel.send('```ansi\n\x1b[32mEnter the score:\x1b[0m```');
            let scoreResponse;
            try {
                scoreResponse = await message.channel.awaitMessages({
                    filter,
                    max: 1,
                    time: timeout,
                    errors: ['time']
                });
            } catch (error) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired. Please start over.\n[Ready for input]█\x1b[0m```');
                return;
            }
            const score = parseInt(scoreResponse.first().content);
            if (isNaN(score)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid score value\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Store previous scores for verification
            const previousScores = [...arcadeScores.games[gameName].scores];

            // Save the new score
            const updatedScores = await database.saveArcadeScore(gameName, username, score);

            // Create confirmation embed
            const embed = new TerminalEmbed()
                .setTerminalTitle('HIGH SCORE UPDATED')
                .setTerminalDescription('[UPDATE SUCCESSFUL]')
                .addTerminalField('DETAILS', 
                    `GAME: ${gameName}\n` +
                    `USER: ${username}\n` +
                    `SCORE: ${score.toLocaleString()}`)
                .addTerminalField('PREVIOUS RANKINGS',
                    previousScores.length > 0 ?
                    previousScores.map((s, index) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        return `${medals[index]} ${s.username}: ${s.score.toLocaleString()}`;
                    }).join('\n') :
                    'No previous scores')
                .addTerminalField('NEW RANKINGS',
                    updatedScores.map((s, index) => {
                        const medals = ['🥇', '🥈', '🥉'];
                        return `${medals[index]} ${s.username}: ${s.score.toLocaleString()}`;
                    }).join('\n'))
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !arcade to verify update\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Add High Score Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to update high score\n[Ready for input]█\x1b[0m```');
        }
    }
};

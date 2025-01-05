const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'addhighscore',
    description: 'Add or update high scores',
    async execute(message, args) {
        try {
            // Step 0: Refresh arcade scores to ensure database consistency
            console.log('Refreshing arcade scores...');
            const highscores = await database.refreshArcadeScores(); // Refresh the database with default values if needed

            const filter = m => m.author.id === message.author.id;
            const timeout = 30000; // 30 seconds timeout for each prompt

            // Step 1: Show game list and prompt for game number
            const gameList = Object.keys(highscores.games)
                .map((name, index) => `${index + 1}. ${name}`)
                .join('\n');

            await message.channel.send('```ansi\n\x1b[32mAvailable Games:\n' + gameList + '\n\nEnter the game number:\x1b[0m```');

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
            if (isNaN(gameNum) || gameNum < 1 || gameNum > Object.keys(highscores.games).length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```');
                return;
            }
            const gameName = Object.keys(highscores.games)[gameNum - 1];

            // Step 2: Get username
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

            // Step 3: Get score
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
            const previousScores = [...highscores.games[gameName].scores];

            // Update scores array - automatically handle ranking
            let scores = highscores.games[gameName].scores || [];
            
            // Remove any existing score by this user
            scores = scores.filter(s => s.username.toLowerCase() !== username.toLowerCase());
            
            // Add new score
            scores.push({ username, score, date: new Date().toISOString() });
            
            // Sort by score (highest to lowest) and limit to top 3
            scores.sort((a, b) => b.score - a.score);
            scores = scores.slice(0, 3);

            // Update in database
            highscores.games[gameName].scores = scores;
            await database.saveHighScores(highscores);

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
                    scores.map((s, index) => {
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

// addhighscores.js
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'addhighscore',
    description: 'Add or update high scores',
    async execute(message, args) {
        try {
            if (args.length < 4) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !addhighscore <game> <username> <score> <rank>\nExample: !addhighscore "Tony Hawk\'s Pro Skater" username 2000000 1\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Parse arguments
            const rank = parseInt(args.pop()); // Get rank from the end
            const score = parseInt(args.pop()); // Get score from the end
            const username = args.pop(); // Get username from what's left
            const gameName = args.join(' '); // Combine remaining args for game name

            // Validate inputs
            if (isNaN(rank) || rank < 1 || rank > 3) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Rank must be 1, 2, or 3\n[Ready for input]█\x1b[0m```');
                return;
            }

            if (isNaN(score)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid score value\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Get current high scores from database
            const highscores = await database.getHighScores();

            // Validate game exists
            if (!highscores.games[gameName]) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game name\nValid games are:\n' + 
                    Object.keys(highscores.games).join('\n') + 
                    '\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Store previous scores for verification
            const previousScores = [...highscores.games[gameName].scores];

            // Update scores array
            let scores = highscores.games[gameName].scores;
            scores = scores.filter(s => s.rank !== rank); // Remove existing score at this rank
            scores.push({ username, score, rank });
            
            // Sort scores by rank
            scores.sort((a, b) => a.rank - b.rank);
            
            // Update in database
            highscores.games[gameName].scores = scores;
            await database.saveHighScores(highscores);

            // Create score comparison text
            let comparisonText = 'Previous Scores:\n';
            previousScores.forEach(s => {
                comparisonText += `${s.rank}. ${s.username}: ${s.score}\n`;
            });
            comparisonText += '\nNew Scores:\n';
            scores.forEach(s => {
                comparisonText += `${s.rank}. ${s.username}: ${s.score}\n`;
            });

            // Create confirmation embed
            const embed = new TerminalEmbed()
                .setTerminalTitle('HIGH SCORE UPDATED')
                .setTerminalDescription('[UPDATE SUCCESSFUL]')
                .addTerminalField('DETAILS', 
                    `GAME: ${gameName}\n` +
                    `USER: ${username}\n` +
                    `SCORE: ${score}\n` +
                    `RANK: ${rank}`)
                .addTerminalField('VERIFICATION', comparisonText)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !highscores to verify update\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Add High Score Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to update high score\n[Ready for input]█\x1b[0m```');
        }
    }
};

// commands/review.js
const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

module.exports = {
    name: 'review',
    description: 'Read or write game reviews',
    async execute(message, args) {
        try {
            if (!args.length) {
                const embed = new TerminalEmbed()
                    .setTerminalTitle('REVIEW SYSTEM')
                    .setTerminalDescription('[SELECT AN OPTION]')
                    .addTerminalField('AVAILABLE COMMANDS',
                        '!review read - View game reviews\n' +
                        '!review write - Submit a new review')
                    .setTerminalFooter();

                await message.channel.send({ embeds: [embed] });
                return;
            }

            const subcommand = args[0].toLowerCase();

            if (subcommand === 'read') {
                await this.displayReviews(message);
            } else if (subcommand === 'write') {
                await this.writeReview(message);
            } else {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid option. Use !review for help\n[Ready for input]█\x1b[0m```');
            }
        } catch (error) {
            console.error('Review Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to process review command\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayReviews(message) {
        try {
            const validGames = await database.getValidGamesList();
            const reviews = await database.getReviews();

            // Filter to only show games that have reviews
            const gamesWithReviews = validGames.filter(game => 
                reviews.games[game]?.reviews?.length > 0
            );

            if (gamesWithReviews.length === 0) {
                await message.channel.send('```ansi\n\x1b[32mNo reviews have been submitted yet.\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Show list of games with reviews
            const gameList = gamesWithReviews
                .map((game, index) => `${index + 1}. ${game} (${reviews.games[game].reviews.length} reviews)`)
                .join('\n');

            const embed = new TerminalEmbed()
                .setTerminalTitle('GAME REVIEWS')
                .setTerminalDescription('[SELECT A GAME TO VIEW REVIEWS]')
                .addTerminalField('REVIEWED GAMES', gameList)
                .addTerminalField('USAGE', 'Enter a game number to view its reviews')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

            // Wait for game selection
            const filter = m => m.author.id === message.author.id && !isNaN(m.content);
            const response = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            });

            const choice = parseInt(response.first().content);
            if (choice < 1 || choice > gamesWithReviews.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```');
                return;
            }

            const selectedGame = gamesWithReviews[choice - 1];
            const gameReviews = reviews.games[selectedGame];

            // Create review display embed
            const reviewEmbed = new TerminalEmbed()
                .setTerminalTitle(`${selectedGame} REVIEWS`)
                .setTerminalDescription('[DISPLAYING REVIEW DATA]')
                .addTerminalField('AVERAGE SCORES',
                    `ART: ${gameReviews.averageScores.art}/5\n` +
                    `STORY: ${gameReviews.averageScores.story}/5\n` +
                    `COMBAT: ${gameReviews.averageScores.combat}/5\n` +
                    `MUSIC: ${gameReviews.averageScores.music}/5\n` +
                    `OVERALL: ${gameReviews.averageScores.overall}/5`);

            // Add individual reviews
            gameReviews.reviews.forEach((review, index) => {
                reviewEmbed.addTerminalField(`REVIEW BY ${review.username}`,
                    `ART: ${review.scores.art}/5 | ` +
                    `STORY: ${review.scores.story}/5 | ` +
                    `COMBAT: ${review.scores.combat}/5 | ` +
                    `MUSIC: ${review.scores.music}/5 | ` +
                    `OVERALL: ${review.scores.overall}/5\n\n` +
                    `COMMENTS: ${review.comments}`);
            });

            await message.channel.send({ embeds: [reviewEmbed] });

        } catch (error) {
            if (error.name === 'CollectionError') {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired\n[Ready for input]█\x1b[0m```');
            } else {
                throw error;
            }
        }
    },

    async writeReview(message) {
        try {
            const validGames = await database.getValidGamesList();

            // Show list of available games
            const gameList = validGames
                .map((game, index) => `${index + 1}. ${game}`)
                .join('\n');

            const embed = new TerminalEmbed()
                .setTerminalTitle('WRITE REVIEW')
                .setTerminalDescription('[SELECT A GAME TO REVIEW]')
                .addTerminalField('AVAILABLE GAMES', gameList)
                .addTerminalField('USAGE', 
                    'Enter a game number\n' +
                    'Or type the exact name of an unlisted game')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

            // Get game selection
            const filter = m => m.author.id === message.author.id;
            const gameResponse = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            });

            let selectedGame;
            const input = gameResponse.first().content;

            // Handle game selection
            if (!isNaN(input)) {
                const index = parseInt(input) - 1;
                if (index >= 0 && index < validGames.length) {
                    selectedGame = validGames[index];
                }
            } else {
                // Check for exact match or request new game
                selectedGame = validGames.find(game => 
                    game.toLowerCase() === input.toLowerCase()
                );

                if (!selectedGame) {
                    await message.channel.send('```ansi\n\x1b[32mGame not found. Contact an admin to add new games.\n[Ready for input]█\x1b[0m```');
                    return;
                }
            }

            if (!selectedGame) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game selection\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Collect scores
            const scores = {};
            const categories = [
                ['art', 'Rate the art/graphics (1-5):'],
                ['story', 'Rate the story/narrative (1-5):'],
                ['combat', 'Rate the combat/gameplay (1-5):'],
                ['music', 'Rate the music/sound (1-5):'],
                ['overall', 'Rate the overall experience (1-5):']
            ];

            for (const [category, prompt] of categories) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m${prompt}\x1b[0m\`\`\``);
                
                const scoreResponse = await message.channel.awaitMessages({
                    filter: m => {
                        const num = parseInt(m.content);
                        return filter(m) && !isNaN(num) && num >= 1 && num <= 5;
                    },
                    max: 1,
                    time: 30000,
                    errors: ['time']
                });
                
                scores[category] = parseInt(scoreResponse.first().content);
            }

            // Get comments
            await message.channel.send('```ansi\n\x1b[32mAdd any comments about your experience:\x1b[0m```');
            const commentsResponse = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 60000,
                errors: ['time']
            });

            // Save review
            const review = {
                scores,
                comments: commentsResponse.first().content
            };

            await database.saveReview(selectedGame, message.author.username, review);

            // Show confirmation
            const confirmEmbed = new TerminalEmbed()
                .setTerminalTitle('REVIEW SUBMITTED')
                .setTerminalDescription('[REVIEW SAVED SUCCESSFULLY]')
                .addTerminalField('REVIEW DETAILS',
                    `GAME: ${selectedGame}\n` +
                    `ART: ${scores.art}/5\n` +
                    `STORY: ${scores.story}/5\n` +
                    `COMBAT: ${scores.combat}/5\n` +
                    `MUSIC: ${scores.music}/5\n` +
                    `OVERALL: ${scores.overall}/5\n\n` +
                    `COMMENTS: ${review.comments}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [confirmEmbed] });

        } catch (error) {
            if (error.name === 'CollectionError') {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired\n[Ready for input]█\x1b[0m```');
            } else {
                throw error;
            }
        }
    }
};

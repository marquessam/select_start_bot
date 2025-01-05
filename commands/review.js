// commands/review.js
const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');
const DataService = require('../services/dataService');

module.exports = {
    name: 'review',
    description: 'Read or write game reviews',
    async execute(message, args) {
        try {
            if (args.length === 0) {
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
        const reviews = await database.getReviews();
        const games = Object.entries(reviews.games);

        if (games.length === 0) {
            await message.channel.send('```ansi\n\x1b[32mNo reviews submitted yet.\n[Ready for input]█\x1b[0m```');
            return;
        }

        // Show game list first
        const gameList = games.map(([name, data], index) => 
            `${index + 1}. ${name} (${data.reviews.length} reviews)`
        ).join('\n');

        const embed = new TerminalEmbed()
            .setTerminalTitle('GAME REVIEWS')
            .setTerminalDescription('[SELECT A GAME TO VIEW REVIEWS]')
            .addTerminalField('AVAILABLE GAMES', gameList)
            .addTerminalField('USAGE', 'Type a game number to view its reviews')
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

        // Wait for game selection
        const filter = m => m.author.id === message.author.id && !isNaN(m.content);
        try {
            const collected = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            });

            const choice = parseInt(collected.first().content);
            if (choice < 1 || choice > games.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```');
                return;
            }

            const [gameName, gameData] = games[choice - 1];

            // Show reviews for selected game
            const reviewEmbed = new TerminalEmbed()
                .setTerminalTitle(`${gameName} REVIEWS`)
                .setTerminalDescription('[DISPLAYING REVIEW DATA]')
                .addTerminalField('AVERAGE SCORES',
                    `ART: ${gameData.averageScores.art}/5\n` +
                    `STORY: ${gameData.averageScores.story}/5\n` +
                    `COMBAT: ${gameData.averageScores.combat}/5\n` +
                    `MUSIC: ${gameData.averageScores.music}/5\n` +
                    `OVERALL: ${gameData.averageScores.overall}/5`);

            // Add individual reviews
            gameData.reviews.forEach((review, index) => {
                reviewEmbed.addTerminalField(`REVIEW #${index + 1} - BY ${review.username}`,
                    `ART: ${review.scores.art}/5 | ` +
                    `STORY: ${review.scores.story}/5 | ` +
                    `COMBAT: ${review.scores.combat}/5 | ` +
                    `MUSIC: ${review.scores.music}/5 | ` +
                    `OVERALL: ${review.scores.overall}/5\n\n` +
                    `COMMENTS: ${review.comments}`);
            });

            await message.channel.send({ embeds: [reviewEmbed] });

        } catch (error) {
            if (error instanceof Collection) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired\n[Ready for input]█\x1b[0m```');
            } else {
                throw error;
            }
        }
    },

    async writeReview(message) {
        const filter = m => m.author.id === message.author.id;
        const currentChallenge = await database.getCurrentChallenge();

        await message.channel.send('```ansi\n\x1b[32mEnter the game name:\x1b[0m```');

        try {
            const gameResponse = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            });
            const gameName = gameResponse.first().content;

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
                
                const response = await message.channel.awaitMessages({
                    filter: m => filter(m) && !isNaN(m.content) && m.content >= 1 && m.content <= 5,
                    max: 1,
                    time: 30000,
                    errors: ['time']
                });
                
                scores[category] = parseInt(response.first().content);
            }

            await message.channel.send('```ansi\n\x1b[32mEnter any additional comments:\x1b[0m```');
            const commentsResponse = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 60000,
                errors: ['time']
            });

            const review = {
                scores,
                comments: commentsResponse.first().content
            };

            await database.saveReview(gameName, message.author.username, review);

            const embed = new TerminalEmbed()
                .setTerminalTitle('REVIEW SUBMITTED')
                .setTerminalDescription('[REVIEW SAVED SUCCESSFULLY]')
                .addTerminalField('REVIEW DETAILS',
                    `GAME: ${gameName}\n` +
                    `ART: ${scores.art}/5\n` +
                    `STORY: ${scores.story}/5\n` +
                    `COMBAT: ${scores.combat}/5\n` +
                    `MUSIC: ${scores.music}/5\n` +
                    `OVERALL: ${scores.overall}/5\n\n` +
                    `COMMENTS: ${review.comments}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            if (error instanceof Collection) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired\n[Ready for input]█\x1b[0m```');
            } else {
                throw error;
            }
        }
    }
};

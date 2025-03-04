const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

module.exports = {
    name: 'review',
    description: 'Read or write game reviews',
    async execute(message, args, { shadowGame, mobyAPI }) {
        try {
            if (!args.length) {
                return await showHelp(message);
            }

            const [subcommand] = args;

            switch (subcommand.toLowerCase()) {
                case 'read':
                    await handleRead(message, shadowGame, mobyAPI);
                    break;
                case 'write':
                    // Pass the rest of the arguments (the game title) to handleWrite
                    await handleWrite(message, args.slice(1), mobyAPI);
                    break;
                default:
                    await showHelp(message);
            }
        } catch (error) {
            console.error('Review Command Error:', error);
            await message.channel.send(
                '```ansi\n\x1b[32m[ERROR] Failed to process review command\n[Ready for input]█\x1b[0m```'
            );
        }
    }
};

async function showHelp(message) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('REVIEW SYSTEM')
        .setTerminalDescription('[SELECT AN OPTION]')
        .addTerminalField(
            'COMMANDS',
            '!review read - Browse and read game reviews\n' +
            '!review write <game title> - Submit a new review' 
        )
        //TRIFORCE SHADOWGAME
        .addTerminalField('ANCIENT WISDOM',
        `[W5J9CH]`)
        //TRIFOCE SHADOWGAME
        .addTerminalField(
            'SCORING CATEGORIES',
            'Art/Graphics (1-5)\n' +
            'Story/Narrative (1-5)\n' +
            'Combat/Gameplay (1-5)\n' +
            'Music/Sound (1-5)\n' +
            'Overall Experience (1-5)'
        )
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleRead(message, shadowGame, mobyAPI) {
    const validGames = await database.getValidGamesList();
    const reviews = await database.getReviews();

    const gamesWithReviews = validGames.filter(
        (game) => reviews.games[game]?.reviews?.length > 0
    );

    if (gamesWithReviews.length === 0) {
        await message.channel.send(
            '```ansi\n\x1b[32mNo reviews have been submitted yet.\n[Ready for input]█\x1b[0m```'
        );
        return;
    }

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

    const filter = (m) => m.author.id === message.author.id && !isNaN(m.content);
    const collected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 30000
    });

    if (collected.size === 0) {
        await message.channel.send(
            '```ansi\n\x1b[32m[ERROR] No response received. Command timed out.\n[Ready for input]█\x1b[0m```'
        );
        return;
    }

    const choice = parseInt(collected.first().content);
    if (choice < 1 || choice > gamesWithReviews.length) {
        await message.channel.send(
            '```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```'
        );
        return;
    }

    const selectedGame = gamesWithReviews[choice - 1];
    const gameReviews = reviews.games[selectedGame];

    // Fetch box art and game details from MobyAPI
    let boxArtUrl = null;
    let description = null;

    try {
        const result = await mobyAPI.searchGames(selectedGame);

        if (result && result.games.length > 0) {
            const game = result.games[0];
            boxArtUrl = game.sample_cover?.image || null;
            description = game.description?.replace(/<[^>]*>/g, '').trim() || null;
        } else {
            console.warn(`No results found for "${selectedGame}" in MobyAPI.`);
        }
    } catch (error) {
        console.error(`Failed to fetch details for "${selectedGame}":`, error);
    }

    const reviewEmbed = new TerminalEmbed()
        .setTerminalTitle(`${selectedGame} REVIEWS`)
        .addTerminalField(
            'AVERAGE SCORES',
            `ART: ${gameReviews.averageScores.art}/5\n` +
            `STORY: ${gameReviews.averageScores.story}/5\n` +
            `COMBAT: ${gameReviews.averageScores.combat}/5\n` +
            `MUSIC: ${gameReviews.averageScores.music}/5\n` +
            `OVERALL: ${gameReviews.averageScores.overall}/5`
        );

    if (boxArtUrl) {
        reviewEmbed.setImage(boxArtUrl);
    }

    gameReviews.reviews.forEach((review) => {
        reviewEmbed.addTerminalField(
            `REVIEW BY ${review.username}`,
            `ART: ${review.scores.art}/5 | ` +
            `STORY: ${review.scores.story}/5 | ` +
            `COMBAT: ${review.scores.combat}/5 | ` +
            `MUSIC: ${review.scores.music}/5 | ` +
            `OVERALL: ${review.scores.overall}/5\n\n` +
            `COMMENTS: ${review.comments}`
        );
    });

    reviewEmbed.setTerminalFooter('Data provided by MobyGames');

    await message.channel.send({ embeds: [reviewEmbed] });

    await message.channel.send('```ansi\n\x1b[32m> Review data loaded successfully\n[Ready for input]█\x1b[0m```');

    if (shadowGame) {
        await shadowGame.tryShowError(message);
    }
}

async function handleWrite(message, args, mobyAPI) {
    if (args.length === 0) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Please provide a game title to review\nExample: !review write Super Metroid\n[Ready for input]█\x1b[0m```');
        return;
    }

    const inputTitle = args.join(' ');
    try {
        const searchResults = await mobyAPI.searchGames(inputTitle);

        if (!searchResults?.games?.length) {
            await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] No games found matching "${inputTitle}"\n[Ready for input]█\x1b[0m\`\`\``);
            return;
        }

        // Get top 5 matches
        const matches = searchResults.games.slice(0, 5);
        
        // Display matches
        const embed = new TerminalEmbed()
            .setTerminalTitle('GAME MATCHES FOUND')
            .setTerminalDescription('[SELECT A GAME TO REVIEW]')
            .addTerminalField('MATCHING GAMES',
                matches.map((game, i) => 
                    `${i + 1}. ${game.title} (${game.platform || 'Multiple Platforms'})`
                ).join('\n')
            )
            .addTerminalField('USAGE',
                'Enter the number of the game you want to review\n' +
                'Or type "custom" to use your exact title'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

        // Wait for user selection
        const filter = m => m.author.id === message.author.id;
        const collected = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000
        });

        if (!collected.size) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] No response received. Command timed out.\n[Ready for input]█\x1b[0m```');
            return;
        }

        const response = collected.first().content.toLowerCase();
        let validatedTitle;

        if (response === 'custom') {
            validatedTitle = inputTitle;
        } else {
            const choice = parseInt(response);
            if (isNaN(choice) || choice < 1 || choice > matches.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid selection\n[Ready for input]█\x1b[0m```');
                return;
            }
            validatedTitle = matches[choice - 1].title;
        }

        // Check for existing review
        const existingReviews = await database.getReviewsForGame(validatedTitle);
        const hasReviewed = existingReviews.some(
            review => review.username.toLowerCase() === message.author.username.toLowerCase()
        );

        if (hasReviewed) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] You have already reviewed this game\n[Ready for input]█\x1b[0m```');
            return;
        }

        await message.channel.send('```ansi\n\x1b[32m[WARNING] You have 3 minutes to respond to each prompt\n[Ready for input]█\x1b[0m```');
        await collectReviewDetails(message, validatedTitle);

    } catch (error) {
        console.error('Game validation error:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to validate game title\n[Ready for input]█\x1b[0m```');
    }
}

async function collectReviewDetails(message, gameTitle) {
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

        const scoreCollected = await message.channel.awaitMessages({
            filter: (m) => {
                const num = parseInt(m.content);
                return m.author.id === message.author.id && !isNaN(num) && num >= 1 && num <= 5;
            },
            max: 1,
            time: 30000 // 30 seconds for each score
        });

        if (scoreCollected.size === 0) {
            await message.channel.send(
                '```ansi\n\x1b[32m[ERROR] No response received. Command timed out.\n[Ready for input]█\x1b[0m```'
            );
            return;
        }

        scores[category] = parseInt(scoreCollected.first().content);
    }

    await message.channel.send(
        '```ansi\n\x1b[32mAdd any comments about your experience (You have 3 minutes to respond):\x1b[0m```'
    );
    const commentsCollected = await message.channel.awaitMessages({
        filter: (m) => m.author.id === message.author.id,
        max: 1,
        time: 180000 // 3 minutes for comments
    });

    if (commentsCollected.size === 0) {
        await message.channel.send(
            '```ansi\n\x1b[32m[ERROR] No response received. Command timed out.\n[Ready for input]█\x1b[0m```'
        );
        return;
    }

    const review = {
        scores,
        comments: commentsCollected.first().content
    };

    await database.saveReview(gameTitle, message.author.username, review);

    const confirmEmbed = new TerminalEmbed()
        .setTerminalTitle('REVIEW SUBMITTED')
        .setTerminalDescription('[REVIEW SAVED SUCCESSFULLY]')
        .addTerminalField(
            'REVIEW DETAILS',
            `GAME: ${gameTitle}\n` +
            `ART: ${scores.art}/5\n` +
            `STORY: ${scores.story}/5\n` +
            `COMBAT: ${scores.combat}/5\n` +
            `MUSIC: ${scores.music}/5\n` +
            `OVERALL: ${scores.overall}/5\n\n` +
            `COMMENTS: ${review.comments}`
        )
        .setTerminalFooter();

    await message.channel.send({ embeds: [confirmEmbed] });
}

// arcade.js

const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');
const mobyAPI = require('../mobyAPI');

module.exports = {
    name: 'arcade',
    description: 'Manage arcade games and scores',
    async execute(message, args) {
        try {
            if (!args.length) {
                return await showGameList(message);
            }

            const [command, ...subArgs] = args;

            // Admin commands check
            const adminCommands = ['reset', 'rules'];
            if (adminCommands.includes(command)) {
                const hasPermission = message.member && (
                    message.member.permissions.has('Administrator') ||
                    message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)
                );

                if (!hasPermission) {
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                    return;
                }
            }

            switch (command) {
                case 'reset':
                    await handleReset(message, subArgs);
                    break;
                case 'rules':
                    await handleRules(message);
                    break;
                default:
                    await handleViewGame(message, args);
                    break;
            }
        } catch (error) {
            console.error('Arcade Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Arcade operation failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

async function showGameList(message) {
    const arcadeData = await database.getArcadeScores();
    
    // Build a list of games with an index
    const gameList = Object.entries(arcadeData.games)
        .map(([name, game], index) => {
            const hasScores = game.scores.length > 0 ? '✓' : ' ';
            return `${index + 1}. ${name} (${game.platform}) ${hasScores}`;
        })
        .join('\n');

    // Create the embed
    const embed = new TerminalEmbed()
        .setTerminalTitle('ARCADE CHALLENGE')
        .setTerminalDescription(
            '[DATABASE ACCESS GRANTED]\n' +
            '[SELECT A GAME TO VIEW RANKINGS]\n' +
            `[EXPIRES: ${arcadeData.expiryDate}]`
        )
        .addTerminalField(
            'SUBMISSION REQUIREMENTS',
            'All high scores must be verified with screenshot evidence posted in the screenshot-submissions channel.'
        )
        .addTerminalField(
            'AVAILABLE GAMES',
            gameList + '\n\n✓ = Scores recorded'
        )
        .addTerminalField(
            'USAGE',
            '!arcade <game number> - View specific game rankings\n' +
            '!arcade reset <game_number> [username] - Reset scores\n' +
            '!arcade rules - Update game rules'
        );

    // Attempt to embed an image for the first game
    const firstGameName = Object.keys(arcadeData.games)[0];
    const firstGameData = arcadeData.games[firstGameName];
    let firstBoxArt = firstGameData?.boxArt;
    
    // If there's no box art in the database, fetch from Moby
    if (!firstBoxArt && firstGameName) {
        firstBoxArt = await fetchBoxArt(firstGameName);
    }

    // If we have a box art URL, set it in the embed
    if (firstBoxArt) {
        embed.setImage(firstBoxArt);
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}

async function handleViewGame(message, args) {
    const gameNum = parseInt(args[0]);
    const arcadeData = await database.getArcadeScores();
    const games = Object.entries(arcadeData.games);
    
    if (isNaN(gameNum) || gameNum < 1 || gameNum > games.length) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```');
        return;
    }

    const [gameName, gameData] = games[gameNum - 1];

    // Build the score list
    const scoreList = gameData.scores.length > 0
        ? gameData.scores
            .map((score, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                return `${medals[index] || ''} ${score.username}: ${score.score.toLocaleString()}`;
            })
            .join('\n')
        : 'No scores recorded';

    // Check if we have boxArt in DB; if not, fetch from Moby
    let boxArt = gameData.boxArt;
    let mobyLink = '';

    try {
        const searchResult = await mobyAPI.searchGames(gameName);
        if (searchResult?.games?.length > 0) {
            // Try to find exact match first
            let matchedGame = searchResult.games.find(game => 
                game.title.toLowerCase() === gameName.toLowerCase()
            );

            // If no exact match, use first result
            if (!matchedGame) {
                matchedGame = searchResult.games[0];
            }

            console.log(`Matched game: ${matchedGame.title} for search: ${gameName}`);

            if (!boxArt && matchedGame.sample_cover?.image) {
                boxArt = matchedGame.sample_cover.image;
            }

            mobyLink = `https://www.mobygames.com/game/${matchedGame.game_id}/${matchedGame.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')}`;
        }
    } catch (error) {
        console.error('Failed to fetch game data:', error);
    }

    const embed = new TerminalEmbed()
        .setTerminalTitle(`${gameName} RANKINGS`)
        .setTerminalDescription(
            '[DATABASE ACCESS GRANTED]' + 
            (mobyLink ? `\n\n[View on MobyGames](${mobyLink})` : '')
        )
        .addTerminalField(
            'GAME INFO',
            `PLATFORM: ${gameData.platform}\n` +
            `RULES: ${gameData.description}`
        )
        .addTerminalField('HIGH SCORES', scoreList);

    if (boxArt) {
        embed.setImage(boxArt);
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}
async function handleReset(message, args) {
    if (!args.length) {
        await message.channel.send(
            '```ansi\n\x1b[32m[ERROR] Invalid syntax\n' +
            'Usage: !arcade reset <game_number> [username]\n' +
            '[Ready for input]█\x1b[0m```'
        );
        return;
    }

    const gameNum = parseInt(args[0]);
    const username = args[1]?.toLowerCase();

    const arcadeData = await database.getArcadeScores();
    const games = Object.entries(arcadeData.games);

    if (gameNum < 1 || gameNum > games.length) {
        await message.channel.send(
            '```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```'
        );
        return;
    }

    const [gameName, gameData] = games[gameNum - 1];
    const oldScores = [...(gameData.scores || [])];

    // Remove a single user's score, or reset all scores
    if (username) {
        await database.removeArcadeScore(gameName, username);
    } else {
        await database.resetArcadeScores(gameName);
    }

    // Retrieve updated data for display
    const updatedData = await database.getArcadeScores();
    const updatedScores = updatedData.games[gameName].scores;

    // If no boxArt, attempt to fetch from Moby
    let boxArt = gameData.boxArt;
    if (!boxArt) {
        boxArt = await fetchBoxArt(gameName);
    }

    const embed = new TerminalEmbed()
        .setTerminalTitle(`${gameName} - SCORES RESET`)
        .setTerminalDescription('[UPDATE COMPLETE]')
        .addTerminalField(
            'ACTION TAKEN',
            username
                ? `Removed score for user: ${username}`
                : 'Reset all scores for game'
        );

    // Show previous rankings if any
    if (oldScores.length > 0) {
        embed.addTerminalField(
            'PREVIOUS RANKINGS',
            oldScores
                .map((score, index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const medal = medals[index] || '';
                    return `${medal} ${score.username}: ${score.score.toLocaleString()}`;
                })
                .join('\n')
        );
    }

    // Show updated rankings
    embed.addTerminalField(
        'CURRENT RANKINGS',
        updatedScores.length > 0
            ? updatedScores
                .map((score, index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const medal = medals[index] || '';
                    return `${medal} ${score.username}: ${score.score.toLocaleString()}`;
                })
                .join('\n')
            : 'No scores recorded'
    );

    // Add the box art if available
    if (boxArt) {
        embed.setImage(boxArt);
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}

async function handleRules(message) {
    const filter = m => m.author.id === message.author.id;
    const timeout = 30000;

    await message.channel.send(
        '```ansi\n\x1b[32mEnter the game number to update rules for:\x1b[0m```'
    );

    let gameResponse;
    try {
        gameResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });
    } catch (error) {
        await message.channel.send(
            '```ansi\n\x1b[32m[ERROR] Time expired\n[Ready for input]█\x1b[0m```'
        );
        return;
    }

    const gameNum = parseInt(gameResponse.first().content);
    const arcadeData = await database.getArcadeScores();
    const games = Object.entries(arcadeData.games);

    if (isNaN(gameNum) || gameNum < 1 || gameNum > games.length) {
        await message.channel.send(
            '```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```'
        );
        return;
    }

    const [gameName, gameData] = games[gameNum - 1];

    await message.channel.send(
        '```ansi\n\x1b[32mEnter the new rules:\x1b[0m```'
    );

    let rulesResponse;
    try {
        rulesResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });
    } catch (error) {
        await message.channel.send(
            '```ansi\n\x1b[32m[ERROR] Time expired\n[Ready for input]█\x1b[0m```'
        );
        return;
    }

    const newRules = rulesResponse.first().content;
    await database.updateArcadeRules(gameName, newRules);

    // If the game doesn't already have boxArt, fetch it from Moby
    let boxArt = gameData.boxArt;
    if (!boxArt) {
        boxArt = await fetchBoxArt(gameName);
    }

    const embed = new TerminalEmbed()
        .setTerminalTitle('GAME RULES UPDATED')
        .setTerminalDescription('[UPDATE SUCCESSFUL]')
        .addTerminalField(
            'DETAILS',
            `GAME: ${gameName}\nNEW RULES: ${newRules}`
        );

    // Add the box art if available
    if (boxArt) {
        embed.setImage(boxArt);
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}

/**
 * fetchBoxArt
 * Uses our MobyAPI to look up box art for a given game name.
 * Adjust this function to match your MobyGames API response structure.
 */
async function fetchBoxArt(gameName) {
    try {
        const result = await mobyAPI.searchGames(gameName);
        
        if (!result || !Array.isArray(result.games) || result.games.length === 0) {
            return null;
        }

        // Find exact match first
        let matchedGame = result.games.find(game => 
            game.title.toLowerCase() === gameName.toLowerCase()
        );

        // If no exact match, use first result
        if (!matchedGame) {
            matchedGame = result.games[0];
        }

        // Log for debugging
        console.log(`Searching for: "${gameName}"`);
        console.log('Found game:', matchedGame.title);
        
        if (matchedGame.sample_cover?.image) {
            return matchedGame.sample_cover.image;
        }

        return null;
    } catch (error) {
        console.error('Failed to fetch box art from MobyGames:', error);
        return null;
    }
}

const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

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

            switch(command) {
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
    
    const gameList = Object.entries(arcadeData.games)
        .map(([name, game], index) => {
            const hasScores = game.scores.length > 0 ? '✓' : ' ';
            return `${index + 1}. ${name} (${game.platform}) ${hasScores}`;
        })
        .join('\n');

    const embed = new TerminalEmbed()
        .setTerminalTitle('ARCADE CHALLENGE')
        .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[SELECT A GAME TO VIEW RANKINGS]\n[EXPIRES: ' + arcadeData.expiryDate + ']')
        .addTerminalField('SUBMISSION REQUIREMENTS', 
            'All high scores must be verified with screenshot evidence posted in the screenshot-submissions channel.')
        .addTerminalField('AVAILABLE GAMES', gameList + '\n\n✓ = Scores recorded')
        .addTerminalField('USAGE', 
            '!arcade <game number> - View specific game rankings\n' +
            '!arcade reset <game_number> [username] - Reset scores\n' +
            '!arcade rules - Update game rules');

    // Add a preview image of the first game if available
    const firstGame = Object.values(arcadeData.games)[0];
    if (firstGame?.boxArt) {
        embed.setImage(firstGame.boxArt);
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
    const scoreList = gameData.scores.length > 0 ?
        gameData.scores
            .map((score, index) => `${['🥇', '🥈', '🥉'][index]} ${score.username}: ${score.score.toLocaleString()}`)
            .join('\n') :
        'No scores recorded';

    const embed = new TerminalEmbed()
        .setTerminalTitle(`${gameName} RANKINGS`)
        .setTerminalDescription('[DATABASE ACCESS GRANTED]')
        .addTerminalField('GAME INFO', 
            `PLATFORM: ${gameData.platform}\n` +
            `RULES: ${gameData.description}`)
        .addTerminalField('HIGH SCORES', scoreList);

    // Add the box art if available
    if (gameData.boxArt) {
        embed.setImage(gameData.boxArt);
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}

async function handleReset(message, args) {
    if (!args.length) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !arcade reset <game_number> [username]\n[Ready for input]█\x1b[0m```');
        return;
    }

    const gameNum = parseInt(args[0]);
    const username = args[1]?.toLowerCase();

    const arcadeData = await database.getArcadeScores();
    const games = Object.entries(arcadeData.games);

    if (gameNum < 1 || gameNum > games.length) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```');
        return;
    }

    const [gameName, gameData] = games[gameNum - 1];
    const oldScores = [...(gameData.scores || [])];

    if (username) {
        await database.removeArcadeScore(gameName, username);
    } else {
        await database.resetArcadeScores(gameName);
    }

    const updatedData = await database.getArcadeScores();
    const updatedScores = updatedData.games[gameName].scores;

    const embed = new TerminalEmbed()
        .setTerminalTitle(`${gameName} - SCORES RESET`)
        .setTerminalDescription('[UPDATE COMPLETE]')
        .addTerminalField('ACTION TAKEN', 
            username ? `Removed score for user: ${username}` : 'Reset all scores for game');

    if (oldScores.length > 0) {
        embed.addTerminalField('PREVIOUS RANKINGS',
            oldScores.map((score, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                return `${medals[index]} ${score.username}: ${score.score.toLocaleString()}`;
            }).join('\n'));
    }

    embed.addTerminalField('CURRENT RANKINGS',
        updatedScores.length > 0 ? 
            updatedScores.map((score, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                return `${medals[index]} ${score.username}: ${score.score.toLocaleString()}`;
            }).join('\n') :
            'No scores recorded');

    // Add the box art to the reset confirmation if available
    if (gameData.boxArt) {
        embed.setImage(gameData.boxArt);
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}

async function handleRules(message) {
    const filter = m => m.author.id === message.author.id;
    const timeout = 30000;

    await message.channel.send('```ansi\n\x1b[32mEnter the game number to update rules for:\x1b[0m```');

    let gameResponse;
    try {
        gameResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });
    } catch (error) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired\n[Ready for input]█\x1b[0m```');
        return;
    }

    const gameNum = parseInt(gameResponse.first().content);
    const arcadeData = await database.getArcadeScores();
    const games = Object.entries(arcadeData.games);

    if (isNaN(gameNum) || gameNum < 1 || gameNum > games.length) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\n[Ready for input]█\x1b[0m```');
        return;
    }

    const [gameName, gameData] = games[gameNum - 1];

    await message.channel.send('```ansi\n\x1b[32mEnter the new rules:\x1b[0m```');

    let rulesResponse;
    try {
        rulesResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });
    } catch (error) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired\n[Ready for input]█\x1b[0m```');
        return;
    }

    const newRules = rulesResponse.first().content;
    await database.updateArcadeRules(gameName, newRules);

    const embed = new TerminalEmbed()
        .setTerminalTitle('GAME RULES UPDATED')
        .setTerminalDescription('[UPDATE SUCCESSFUL]')
        .addTerminalField('DETAILS',
            `GAME: ${gameName}\n` +
            `NEW RULES: ${newRules}`);
    
    // Add the box art to the rules update confirmation if available
    if (gameData.boxArt) {
        embed.setImage(gameData.boxArt);
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}

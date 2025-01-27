const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'challengemanager',
    description: 'Manage monthly challenges',
    async execute(message, args, { announcer }) {
        try {
            if (!args.length) {
                return await showHelp(message);
            }

            const [subcommand, ...subArgs] = args;

            switch(subcommand) {
                case 'set':
                    await handleSetChallenge(message, subArgs);
                    break;
                case 'next':
                    await handleSetNext(message, subArgs);
                    break;
                case 'init':
                    await handleInitNext(message);
                    break;
                case 'switch':
                    await handleSwitch(message, announcer);
                    break;
                default:
                    await showHelp(message);
            }
        } catch (error) {
            console.error('Challenge Manager Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Challenge management operation failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

async function showHelp(message) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('CHALLENGE MANAGEMENT')
        .setTerminalDescription('[COMMAND USAGE]')
        .addTerminalField('AVAILABLE COMMANDS',
            '!challengemanager set <gameId> <gameName> <gameIcon> <startDate> <endDate>\n' +
            '!challengemanager next <param> <value>\n' +
            '!challengemanager init\n' +
            '!challengemanager switch')
        .addTerminalField('PARAMETERS FOR NEXT',
            'gameid - Set game ID\n' +
            'name - Set game name\n' +
            'icon - Set game icon\n' +
            'dates - Set start and end dates')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleSetChallenge(message) {
    const filter = m => m.author.id === message.author.id;
    const timeout = 30000; // 30 seconds for each response
    let challengeData = {
        rules: [
            "Hardcore mode must be enabled",
            "All achievements are eligible",
            "Progress tracked via retroachievements",
            "No hacks/save states/cheats allowed"
        ],
        points: {
            first: 5,
            second: 3,
            third: 2
        }
    };

    try {
        // Step 1: Game ID
        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the game ID:\n[Ready for input]█\x1b[0m```');
        const gameIdResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });
        challengeData.gameId = gameIdResponse.first().content.trim();

        // Step 2: Game Name
        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the game name:\n[Ready for input]█\x1b[0m```');
        const nameResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });
        challengeData.gameName = nameResponse.first().content.trim();

        // Step 3: Game Icon
        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the icon address (e.g., 059119.png):\n[Ready for input]█\x1b[0m```');
        const iconResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });
        challengeData.gameIcon = `/Images/${iconResponse.first().content.trim()}`;

        // Step 4: Start and End Dates
        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the start date (MM/DD/YY):\n[Ready for input]█\x1b[0m```');
        const startResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });
        challengeData.startDate = startResponse.first().content.trim();

        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the end date (MM/DD/YY):\n[Ready for input]█\x1b[0m```');
        const endResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });
        challengeData.endDate = endResponse.first().content.trim();

        // Show confirmation
        const embed = new TerminalEmbed()
            .setTerminalTitle('CONFIRM CHALLENGE SETUP')
            .setTerminalDescription('[REVIEW DETAILS]')
            .addTerminalField('CHALLENGE INFORMATION', 
                `GAME ID: ${challengeData.gameId}\n` +
                `GAME NAME: ${challengeData.gameName}\n` +
                `ICON: ${challengeData.gameIcon}\n` +
                `START: ${challengeData.startDate}\n` +
                `END: ${challengeData.endDate}`)
            .addTerminalField('CONFIRMATION REQUIRED',
                'Type "confirm" to save these settings or "cancel" to abort')
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

        const confirmation = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: timeout,
            errors: ['time']
        });

        if (confirmation.first().content.toLowerCase() === 'confirm') {
            await database.saveChallenge(challengeData, 'next');
            
            await message.channel.send('```ansi\n\x1b[32m> Challenge settings saved successfully\n[Ready for input]█\x1b[0m```');
        } else {
            await message.channel.send('```ansi\n\x1b[32m> Challenge setup cancelled\n[Ready for input]█\x1b[0m```');
        }

    } catch (error) {
        if (error.message === 'time') {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Setup timed out. Please start over.\n[Ready for input]█\x1b[0m```');
        } else {
            console.error('Challenge Setup Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to set up challenge\n[Ready for input]█\x1b[0m```');
        }
    }
}
async function handleSetNext(message, args) {
    if (args.length < 2) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUse !challengemanager for help\n[Ready for input]█\x1b[0m```');
        return;
    }

    let nextChallenge = await database.getNextChallenge();
    if (!nextChallenge) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] No next challenge template found\nUse !challengemanager init first\n[Ready for input]█\x1b[0m```');
        return;
    }

    const [param, ...values] = args;

    switch(param) {
        case 'gameid':
            nextChallenge.gameId = values[0];
            break;
        case 'name':
            nextChallenge.gameName = values.join(' ');
            break;
        case 'icon':
            nextChallenge.gameIcon = values[0];
            break;
        case 'dates':
            if (values.length !== 2) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid dates format\nUse: !challengemanager next dates <start> <end>\n[Ready for input]█\x1b[0m```');
                return;
            }
            nextChallenge.startDate = values[0];
            nextChallenge.endDate = values[1];
            break;
        default:
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid parameter\nUse !challengemanager for help\n[Ready for input]█\x1b[0m```');
            return;
    }

    await database.saveNextChallenge(nextChallenge);

    const embed = new TerminalEmbed()
        .setTerminalTitle('NEXT CHALLENGE UPDATED')
        .setTerminalDescription('[UPDATE SUCCESSFUL]')
        .addTerminalField('UPDATED PARAMETER', `${param.toUpperCase()}: ${values.join(' ')}`)
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleInitNext(message) {
    const nextChallenge = {
        gameId: "",
        gameName: "",
        gameIcon: "",
        startDate: "",
        endDate: "",
        rules: [
            "Hardcore mode must be enabled",
            "All achievements are eligible",
            "Progress tracked via retroachievements",
            "No hacks/save states/cheats allowed"
        ],
        points: {
            first: 6,
            second: 4,
            third: 2
        }
    };

    await database.saveNextChallenge(nextChallenge);
    
    const embed = new TerminalEmbed()
        .setTerminalTitle('NEXT CHALLENGE SETUP')
        .setTerminalDescription('[SETUP REQUIRED]')
        .addTerminalField('REQUIRED INFORMATION',
            'Please use the following commands to set up the next challenge:\n\n' +
            '!challengemanager next gameid <id>\n' +
            '!challengemanager next name "<game name>"\n' +
            '!challengemanager next icon <icon_path>\n' +
            '!challengemanager next dates <start> <end>')
        .setTerminalFooter();
    
    await message.channel.send({ embeds: [embed] });
}

async function handleSwitch(message, announcer) {
    await message.channel.send('```ansi\n\x1b[32m> Initiating challenge transition...\x1b[0m\n```');
    await announcer.handleNewMonth();

    const currentChallenge = await database.getCurrentChallenge();

    const embed = new TerminalEmbed()
        .setTerminalTitle('MANUAL CHALLENGE TRANSITION')
        .setTerminalDescription('[TRANSITION COMPLETE]')
        .addTerminalField('ACTIONS COMPLETED', 
            '1. Archived previous challenge\n' +
            '2. Switched to new challenge\n' +
            '3. Created new template')
        .addTerminalField('CURRENT CHALLENGE',
            `GAME: ${currentChallenge.gameName}\n` +
            `START: ${currentChallenge.startDate}\n` +
            `END: ${currentChallenge.endDate}`)
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

import TerminalEmbed from '../utils/embedBuilder.js';
import database from '../../database.js';

export default {
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

async function handleSetChallenge(message, args) {
    if (args.length < 5) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !challengemanager set <gameId> <gameName> <gameIcon> <startDate> <endDate>\n[Ready for input]█\x1b[0m```');
        return;
    }

    const [gameId, ...restArgs] = args;
    const endDate = restArgs.pop();
    const startDate = restArgs.pop();
    const gameIcon = restArgs.pop();
    const gameName = restArgs.join(' ').replace(/"/g, '');

    const challengeData = {
        gameId,
        gameName,
        gameIcon,
        startDate,
        endDate,
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

    await database.saveCurrentChallenge(challengeData);

    const embed = new TerminalEmbed()
        .setTerminalTitle('CHALLENGE UPDATED')
        .setTerminalDescription('[UPDATE SUCCESSFUL]')
        .addTerminalField('DETAILS', 
            `GAME ID: ${gameId}\n` +
            `GAME NAME: ${gameName}\n` +
            `ICON: ${gameIcon}\n` +
            `START: ${startDate}\n` +
            `END: ${endDate}`)
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
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

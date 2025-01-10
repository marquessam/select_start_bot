import TerminalEmbed = require('../../utils/embedBuilder.js');
import database = require('../../database.js');

export default {
    name: 'test',
    description: 'Test bot functionality',
    async execute(message, args, { announcer }) {
        try {
            if (!args.length) {
                return await showHelp(message);
            }

            const [subcommand] = args;

            switch(subcommand) {
                case 'month':
                    await handleMonthTest(message, announcer);
                    break;
                case 'announce':
                    await handleAnnounceTest(message);
                    break;
                default:
                    await showHelp(message);
            }
        } catch (error) {
            console.error('Test Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Test operation failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

async function showHelp(message) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('TEST COMMANDS')
        .setTerminalDescription('[COMMAND USAGE]')
        .addTerminalField('AVAILABLE COMMANDS',
            '!test month - Test monthly cycle with real data\n' +
            '!test announce - Test announcements without affecting data')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleMonthTest(message, announcer) {
    await message.channel.send('```ansi\n\x1b[32m> Initiating monthly cycle test...\x1b[0m\n```');

    const currentBefore = await database.getCurrentChallenge();

    // Step 1: Archive current standings
    await message.channel.send('```ansi\n\x1b[32m> Step 1: Archiving leaderboard...\x1b[0m\n```');
    await announcer.handleChallengeEnd();

    // Step 2: Announce new challenge
    await message.channel.send('```ansi\n\x1b[32m> Step 2: Announcing new challenge...\x1b[0m\n```');
    await announcer.announceNewChallenge();

    const currentAfter = await database.getCurrentChallenge();

    const embed = new TerminalEmbed()
        .setTerminalTitle('MONTHLY CYCLE TEST')
        .setTerminalDescription('[TEST COMPLETE]')
        .addTerminalField('TEST ACTIONS', 
            '1. Archived current standings\n' +
            '2. Announced challenge end\n' +
            '3. Announced new challenge')
        .addTerminalField('CHALLENGE STATE CHANGE',
            `BEFORE: ${currentBefore.gameName}\n` +
            `AFTER: ${currentAfter.gameName}`)
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
    await message.channel.send('```ansi\n\x1b[32m> Type !viewarchive <month> to check archive\n[Ready for input]█\x1b[0m```');
}

async function handleAnnounceTest(message) {
    await message.channel.send('```ansi\n\x1b[32m> Initiating announcement test...\x1b[0m\n```');

    const currentChallenge = await database.getCurrentChallenge();
    const nextChallenge = await database.getNextChallenge();

    const embed = new TerminalEmbed()
        .setTerminalTitle('TEST ANNOUNCEMENTS')
        .setTerminalDescription('[TEST MODE ACTIVE]')
        .addTerminalField('SIMULATED ACTIONS', 
            'The following would happen at month end:\n\n' +
            '1. Archive current standings\n' +
            '2. Award points to winners\n' +
            '3. Switch to next challenge\n' +
            '4. Make announcements')
        .addTerminalField('CURRENT SETUP',
            `Current Challenge: ${currentChallenge.gameName || '<Not Set>'}\n` +
            `Next Challenge: ${nextChallenge?.gameName || '<Not Set>'}`)
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

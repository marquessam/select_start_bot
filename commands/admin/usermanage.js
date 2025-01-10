import TerminalEmbed from '../../utils/embedBuilder.js';
import database from '../../database.js';

export default {
    name: 'usermanage',
    description: 'Manage user registration and accounts',
    async execute(message, args, { userTracker }) {
        try {
            if (!args.length) {
                return await showHelp(message);
            }

            const [subcommand, ...subArgs] = args;

            switch(subcommand) {
                case 'remove':
                    await handleRemove(message, subArgs);
                    break;
                case 'scan':
                    await handleScan(message, subArgs, userTracker);
                    break;
                case 'list':
                    await handleList(message, userTracker);
                    break;
                default:
                    await showHelp(message);
            }
        } catch (error) {
            console.error('User Management Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] User management operation failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

async function showHelp(message) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('USER MANAGEMENT')
        .setTerminalDescription('[COMMAND USAGE]')
        .addTerminalField('AVAILABLE COMMANDS',
            '!usermanage remove <username> - Remove a user from the system\n' +
            '!usermanage scan [limit] - Scan RetroAchievements channel for profiles\n' +
            '!usermanage list - View all registered users')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleRemove(message, args) {
    if (!args.length) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Username is required\nUsage: !usermanage remove <username>\n[Ready for input]█\x1b[0m```');
        return;
    }

    const username = args[0].toLowerCase();
    await database.removeValidUser(username);

    const embed = new TerminalEmbed()
        .setTerminalTitle('USER REMOVED')
        .setTerminalDescription('[UPDATE COMPLETE]')
        .addTerminalField('DETAILS', 
            `USERNAME: ${username}\n` +
            `STATUS: Removed from database\n` +
            `TIME: ${new Date().toLocaleTimeString()}`)
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleScan(message, args, userTracker) {
    await message.channel.send('```ansi\n\x1b[32m> Initiating channel scan...\x1b[0m\n```');

    const raChannel = await message.client.channels.fetch(process.env.RA_CHANNEL_ID);
    if (!raChannel) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] RetroAchievements channel not found\n[Ready for input]█\x1b[0m```');
        return;
    }

    const limit = args[0] ? parseInt(args[0]) : 100;
    if (isNaN(limit) || limit < 1) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid limit. Please provide a number greater than 0\n[Ready for input]█\x1b[0m```');
        return;
    }

    const startingUsers = await userTracker.getValidUsers();
    await userTracker.scanHistoricalMessages(raChannel, limit);
    const endingUsers = await userTracker.getValidUsers();

    const newUsers = endingUsers.filter(user => !startingUsers.includes(user));

    const embed = new TerminalEmbed()
        .setTerminalTitle('CHANNEL SCAN COMPLETE')
        .setTerminalDescription('[SCAN COMPLETE]')
        .addTerminalField('SCAN DETAILS', 
            `MESSAGES SCANNED: ${limit}\n` +
            `STARTING USERS: ${startingUsers.length}\n` +
            `ENDING USERS: ${endingUsers.length}\n` +
            `NEW USERS FOUND: ${newUsers.length}`);

    if (newUsers.length > 0) {
        embed.addTerminalField('NEW USERS', newUsers.join('\n'));
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}

async function handleList(message, userTracker) {
    const users = await userTracker.getValidUsers();
    users.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const embed = new TerminalEmbed()
        .setTerminalTitle('REGISTERED USERS')
        .setTerminalDescription('[DATABASE ACCESS GRANTED]')
        .addTerminalField('TOTAL USERS', `${users.length} users registered`)
        .setTerminalFooter();

    // Split users into chunks of 20 for multiple fields if needed
    const chunkSize = 20;
    for (let i = 0; i < users.length; i += chunkSize) {
        const chunk = users.slice(i, i + chunkSize);
        embed.addTerminalField(
            `USERS ${i + 1}-${Math.min(i + chunkSize, users.length)}`,
            chunk.join('\n')
        );
    }

    await message.channel.send({ embeds: [embed] });
}

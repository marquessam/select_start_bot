// commands/admin/scanusers.js
const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'scanusers',
    description: 'Scan RetroAchievements channel for profile URLs',
    async execute(message, args, { userTracker }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Initiating channel scan...\x1b[0m\n```');

            const raChannel = await message.client.channels.fetch(process.env.RA_CHANNEL_ID);
            if (!raChannel) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] RetroAchievements channel not found\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Allow specifying message limit
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
                .setTerminalDescription('[SCAN COMPLETE]\n[PROCESSING RESULTS]')
                .addTerminalField('SCAN DETAILS', 
                    `MESSAGES SCANNED: ${limit}\n` +
                    `STARTING USERS: ${startingUsers.length}\n` +
                    `ENDING USERS: ${endingUsers.length}\n` +
                    `NEW USERS FOUND: ${newUsers.length}`)
                .setTerminalFooter();

            if (newUsers.length > 0) {
                embed.addTerminalField('NEW USERS', newUsers.join('\n'));
            }

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <username> to verify user profiles\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Scan Users Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to scan channel\n[Ready for input]█\x1b[0m```');
        }
    }
};

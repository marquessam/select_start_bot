// commands/admin/addpointsall.js
const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'addpointsall',
    description: 'Add points to all participants',
    async execute(message, args, { userStats }) {
        try {
            if (args.length < 2) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !addpointsall <points> <reason>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const points = parseInt(args[0]);
            const reason = args.slice(1).join(' ');

            if (isNaN(points)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Get all users from spreadsheet
            const validUsers = await userStats.getAllUsers();
            await message.channel.send('```ansi\n\x1b[32m> Processing points allocation for all users...\x1b[0m\n```');

            let successfulAdditions = 0;

            // Add points to each user
            for (const username of validUsers) {
                try {
                    await userStats.addBonusPoints(username, points, reason, message.client);
                    successfulAdditions++;
                } catch (error) {
                    console.error(`Error adding points to ${username}:`, error);
                }
            }

            const embed = new TerminalEmbed()
                .setTerminalTitle('MASS POINTS ALLOCATION')
                .setTerminalDescription('[TRANSACTION COMPLETE]\n[POINTS ADDED SUCCESSFULLY]')
                .addTerminalField('OPERATION DETAILS', 
                    `USERS AFFECTED: ${successfulAdditions}\n` +
                    `POINTS PER USER: ${points}\n` +
                    `REASON: ${reason}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !yearlyboard to verify points\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Add Points All Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to allocate points\n[Ready for input]█\x1b[0m```');
        }
    }
};

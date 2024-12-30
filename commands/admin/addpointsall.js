const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'addpointsall',
    description: 'Add points to all participants',
    async execute(message, args, { userStats }) {
        try {
            // Validate input
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

            // Process points allocation
            const users = await userStats.getAllUsers();
            let successfulAdditions = 0;
            let failedUsers = [];

            // Add points to each user
            for (const username of users) {
                try {
                    await userStats.initializeUserIfNeeded(username);
                    // Assuming we'll modify addBonusPoints to not send messages
                    await userStats.addBonusPoints(username, points, reason);
                    successfulAdditions++;
                } catch (error) {
                    console.error(`Error adding points to ${username}:`, error);
                    failedUsers.push(username);
                }
            }

            // Create response embed
            const embed = new TerminalEmbed()
                .setTerminalTitle('MASS POINTS ALLOCATION')
                .setTerminalDescription('[TRANSACTION COMPLETE]')
                .addTerminalField('OPERATION DETAILS', 
                    `USERS AFFECTED: ${successfulAdditions}/${users.length}\n` +
                    `POINTS PER USER: ${points}\n` +
                    `REASON: ${reason}`);

            if (failedUsers.length > 0) {
                embed.addTerminalField('FAILED ALLOCATIONS',
                    failedUsers.join(', '));
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !yearlyboard to verify points\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Add Points All Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to allocate points\n[Ready for input]█\x1b[0m```');
        }
    }
};

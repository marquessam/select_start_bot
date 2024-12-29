// commands/admin/addpointsmulti.js
const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'addpointsmulti',
    description: 'Add points to multiple specified users',
    async execute(message, args, { userStats }) {
        try {
            if (args.length < 4) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !addpointsmulti <points> <reason> <user1> <user2> ...\n[Ready for input]█\x1b[0m```');
                return;
            }

            const points = parseInt(args[0]);
            const reason = args[1];
            const userList = args.slice(2);

            if (isNaN(points)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Validate users
            const validUsers = await userStats.getAllUsers();
            const invalidUsers = userList.filter(user => !validUsers.includes(user));
            
            if (invalidUsers.length > 0) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] Invalid users: ${invalidUsers.join(', ')}\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Processing points allocation for selected users...\x1b[0m\n```');

            // Add points to each specified user
            for (const username of userList) {
                await userStats.addBonusPoints(username, points, reason, message.client);
            }

            const embed = new TerminalEmbed()
                .setTerminalTitle('MULTI-USER POINTS ALLOCATION')
                .setTerminalDescription('[TRANSACTION COMPLETE]\n[POINTS ADDED SUCCESSFULLY]')
                .addTerminalField('OPERATION DETAILS', 
                    `USERS AFFECTED: ${userList.length}\n` +
                    `POINTS PER USER: ${points}\n` +
                    `REASON: ${reason}\n` +
                    `USERS: ${userList.join(', ')}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !yearlyboard to verify points\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Add Points Multi Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to allocate points\n[Ready for input]█\x1b[0m```');
        }
    }
};

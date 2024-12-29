const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'addpoints',
    description: 'Add points to a user',
    async execute(message, args, { userStats }) {
        try {
            if (args.length < 3) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !addpoints <username> <points> <reason>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const username = args[0];
            const points = parseInt(args[1]);
            const reason = args.slice(2).join(' ');

            if (isNaN(points)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Get the list of valid users
            const validUsers = await userStats.getAllUsers();
            
            // Check if the username is in the valid users list
            if (!validUsers.includes(username)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] User not found in participant list\n[Ready for input]█\x1b[0m```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Processing points allocation...\x1b[0m\n```');
            
            await userStats.addBonusPoints(username, points, reason, message.client);

            const embed = new TerminalEmbed()
                .setTerminalTitle('POINTS ALLOCATED')
                .setTerminalDescription('[TRANSACTION COMPLETE]\n[POINTS ADDED SUCCESSFULLY]')
                .addTerminalField('OPERATION DETAILS', 
                    `USER: ${username}\nPOINTS: ${points}\nREASON: ${reason}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile ' + username + ' to verify points\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Add Points Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to allocate points\n[Ready for input]█\x1b[0m```');
        }
    }
};

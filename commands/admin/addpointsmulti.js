// addpointsmulti.js
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

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
            const invalidUsers = userList.filter(user => !validUsers.includes(user.toLowerCase()));
            
            if (invalidUsers.length > 0) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] Invalid users: ${invalidUsers.join(', ')}\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Processing points allocation for selected users...\x1b[0m\n```');

            // Get initial stats
            const initialStats = await database.getUserStats();
            const currentYear = new Date().getFullYear().toString();
            
            // Track successful and failed additions
            let successfulAdditions = [];
            let failedUsers = [];

            // Add points to each specified user
            for (const username of userList) {
                try {
                    await userStats.addBonusPoints(username, points, reason);
                    successfulAdditions.push(username);
                } catch (error) {
                    console.error(`Error adding points to ${username}:`, error);
                    failedUsers.push(username);
                }
            }

            // Get final stats for verification
            const finalStats = await database.getUserStats();

            // Create verification summary
            let verificationText = '';
            for (const username of userList) {
                const beforePoints = initialStats.users[username]?.yearlyPoints[currentYear] || 0;
                const afterPoints = finalStats.users[username]?.yearlyPoints[currentYear] || 0;
                verificationText += `${username}: ${beforePoints} → ${afterPoints}\n`;
            }

            const embed = new TerminalEmbed()
                .setTerminalTitle('MULTI-USER POINTS ALLOCATION')
                .setTerminalDescription('[TRANSACTION COMPLETE]\n[POINTS ADDED SUCCESSFULLY]')
                .addTerminalField('OPERATION DETAILS', 
                    `USERS AFFECTED: ${successfulAdditions.length}/${userList.length}\n` +
                    `POINTS PER USER: ${points}\n` +
                    `REASON: ${reason}`)
                .addTerminalField('POINTS VERIFICATION',
                    verificationText);

            if (failedUsers.length > 0) {
                embed.addTerminalField('FAILED ALLOCATIONS',
                    failedUsers.join(', '));
            }

            embed.setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !yearlyboard to verify points\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Add Points Multi Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to allocate points\n[Ready for input]█\x1b[0m```');
        }
    }
};

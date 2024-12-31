// addpointsall.js
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

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

            // Get initial stats for verification
            const users = await userStats.getAllUsers();
            const initialStats = await database.getUserStats();
            const currentYear = new Date().getFullYear().toString();

            await message.channel.send('```ansi\n\x1b[32m> Processing mass points allocation...\x1b[0m\n```');

            let successfulAdditions = 0;
            let failedUsers = [];

            // Add points to each user
            for (const username of users) {
                try {
                    await userStats.addBonusPoints(username, points, reason);
                    successfulAdditions++;
                } catch (error) {
                    console.error(`Error adding points to ${username}:`, error);
                    failedUsers.push(username);
                }
            }

            // Get final stats for verification
            const finalStats = await database.getUserStats();

            // Create verification summary
            let verificationText = '';
            for (const username of users) {
                const beforePoints = initialStats.users[username]?.yearlyPoints[currentYear] || 0;
                const afterPoints = finalStats.users[username]?.yearlyPoints[currentYear] || 0;
                verificationText += `${username}: ${beforePoints} → ${afterPoints}\n`;
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

            if (verificationText) {
                embed.addTerminalField('POINTS VERIFICATION',
                    verificationText.slice(0, 1024)); // Discord field limit
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

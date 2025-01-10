const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'updatemonth',
    description: 'Updates monthly rankings and points',
    async execute(message, args, { userStats }) {
        try {
            if (args.length !== 4) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !updatemonth <month> <first> <second> <third>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const [month, first, second, third] = args;
            const year = new Date().getFullYear().toString();

            // Get initial stats for verification
            const initialStats = await database.getUserStats();

            // Validate users
            const validUsers = await userStats.getAllUsers();
            const usersToCheck = [first, second, third].filter(Boolean);
            const invalidUsers = usersToCheck.filter(user => !validUsers.includes(user.toLowerCase()));
            
            if (invalidUsers.length > 0) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] Invalid users: ${invalidUsers.join(', ')}\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Processing monthly rankings update...\x1b[0m\n```');

            // Update monthly rankings
            await userStats.addMonthlyPoints(month, year, {
                first,
                second,
                third
            });

            // Get final stats for verification
            const finalStats = await database.getUserStats();

            // Create verification summary
            let verificationText = '';
            for (const username of [first, second, third]) {
                if (username) {
                    const beforePoints = initialStats.users[username]?.yearlyPoints[year] || 0;
                    const afterPoints = finalStats.users[username]?.yearlyPoints[year] || 0;
                    verificationText += `${username}: ${beforePoints} → ${afterPoints}\n`;
                }
            }

            const embed = new TerminalEmbed()
                .setTerminalTitle('MONTHLY RANKINGS UPDATED')
                .setTerminalDescription('[UPDATE COMPLETE]\n[POINTS ALLOCATED]')
                .addTerminalField('RANKINGS PROCESSED',
                    `MONTH: ${month}\n` +
                    `1ST PLACE: ${first} (6 pts)\n` +
                    `2ND PLACE: ${second} (4 pts)\n` +
                    `3RD PLACE: ${third} (2 pts)`)
                .addTerminalField('POINTS VERIFICATION',
                    verificationText)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !yearlyboard to verify rankings\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Update Month Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to update monthly rankings\n[Ready for input]█\x1b[0m```');
        }
    }
};

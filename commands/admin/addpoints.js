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

            const username = args[0].toLowerCase();
            const points = parseInt(args[1]);
            const reason = args.slice(2).join(' ');

            if (isNaN(points)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
                return;
            }

            const validUsers = await userStats.getAllUsers();
            if (!validUsers.includes(username)) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" not found\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Processing points allocation...\x1b[0m\n```');

            const beforeStats = await userStats.getUserStats(username);
            const currentYear = new Date().getFullYear().toString();
            const pointsBefore = beforeStats.yearlyPoints[currentYear] || 0;

            await userStats.addBonusPoints(username, points, reason);

            const afterStats = await userStats.getUserStats(username);
            const pointsAfter = afterStats.yearlyPoints[currentYear] || 0;

            const embed = new TerminalEmbed()
                .setTerminalTitle('POINTS ALLOCATED')
                .setTerminalDescription('[TRANSACTION COMPLETE]\n[POINTS ADDED SUCCESSFULLY]')
                .addTerminalField('OPERATION DETAILS', 
                    `USER: ${username}\n` +
                    `POINTS: ${points}\n` +
                    `REASON: ${reason}`)
                .addTerminalField('VERIFICATION',
                    `POINTS BEFORE: ${pointsBefore}\n` +
                    `POINTS AFTER: ${pointsAfter}\n` +
                    `CHANGE: ${points}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send(`\`\`\`ansi\n\x1b[32m> Type !profile ${username} to verify points\n[Ready for input]█\x1b[0m\`\`\``);
        } catch (error) {
            console.error('Add Points Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to allocate points\n[Ready for input]█\x1b[0m```');
        }
    }
};

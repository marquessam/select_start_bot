const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'resetpoints',
    description: 'Reset all points for a user',
    async execute(message, args, { userStats }) {
        try {
            if (args.length !== 1) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !resetpoints <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const username = args[0].toLowerCase();
            const currentYear = new Date().getFullYear().toString();

            await message.channel.send('```ansi\n\x1b[32m> Initiating points reset...\x1b[0m\n```');

            // Get current stats for verification
            const beforeStats = await userStats.getUserStats(username);
            if (!beforeStats) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" not found\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }
            const pointsBeforeReset = beforeStats.yearlyPoints[currentYear] || 0;

            // Reset the user's points
            await userStats.resetUserPoints(username);

            const afterStats = await userStats.getUserStats(username);
            const pointsAfterReset = afterStats.yearlyPoints[currentYear] || 0;

            const embed = new TerminalEmbed()
                .setTerminalTitle('POINTS RESET')
                .setTerminalDescription('[OPERATION COMPLETE]\n[POINTS RESET SUCCESSFUL]')
                .addTerminalField('RESET DETAILS', 
                    `USER: ${username}\n` +
                    `POINTS BEFORE RESET: ${pointsBeforeReset}\n` +
                    `POINTS AFTER RESET: ${pointsAfterReset}`)
                .addTerminalField('STATUS',
                    'All points have been reset\nMonthly achievements cleared\nBonus points cleared')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send(`\`\`\`ansi\n\x1b[32m> Type !profile ${username} to verify reset\n[Ready for input]█\x1b[0m\`\`\``);

        } catch (error) {
            console.error('Reset Points Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reset points\n[Ready for input]█\x1b[0m```');
        }
    }
};

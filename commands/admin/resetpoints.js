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

            const username = args[0];
            const currentYear = new Date().getFullYear().toString();

            await message.channel.send('```ansi\n\x1b[32m> Initiating points reset...\x1b[0m\n```');

            // Get current stats to show what's being reset
            const beforeStats = await userStats.getUserStats(username);
            const pointsBeforeReset = beforeStats.yearlyPoints[currentYear] || 0;

            // Reset the user's points
            await userStats.resetUserPoints(username);

            const embed = new TerminalEmbed()
                .setTerminalTitle('POINTS RESET')
                .setTerminalDescription('[OPERATION COMPLETE]\n[POINTS RESET SUCCESSFUL]')
                .addTerminalField('RESET DETAILS', 
                    `USER: ${username}\n` +
                    `POINTS BEFORE RESET: ${pointsBeforeReset}\n` +
                    `POINTS AFTER RESET: 0`)
                .addTerminalField('STATUS',
                    'All points have been reset\nMonthly achievements cleared\nBonus points cleared')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile ' + username + ' to verify reset\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Reset Points Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reset points\n[Ready for input]█\x1b[0m```');
        }
    }
};

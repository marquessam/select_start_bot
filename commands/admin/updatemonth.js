const TerminalEmbed = require('../../utils/embedBuilder');

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

            await message.channel.send('```ansi\n\x1b[32m> Processing monthly rankings update...\x1b[0m\n```');

            // Update monthly rankings
            await userStats.addMonthlyPoints(month, year, {
                first,
                second,
                third
            });

            const embed = new TerminalEmbed()
                .setTerminalTitle('MONTHLY RANKINGS UPDATED')
                .setTerminalDescription('[UPDATE COMPLETE]\n[POINTS ALLOCATED]')
                .addTerminalField('RANKINGS PROCESSED',
                    `MONTH: ${month}\n` +
                    `1ST PLACE: ${first} (10 pts)\n` +
                    `2ND PLACE: ${second} (6 pts)\n` +
                    `3RD PLACE: ${third} (3 pts)`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !yearlyboard to verify rankings\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Update Month Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to update monthly rankings\n[Ready for input]█\x1b[0m```');
        }
    }
};

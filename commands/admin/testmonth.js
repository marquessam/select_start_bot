const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'testmonth',
    description: 'Test monthly cycle functions',
    async execute(message, args, { userStats, announcer }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Initiating monthly cycle test...\x1b[0m\n```');

            // Step 1: Archive current standings
            await message.channel.send('```ansi\n\x1b[32m> Step 1: Archiving leaderboard...\x1b[0m\n```');
            await announcer.handleChallengeEnd();

            // Step 2: Announce new challenge
            await message.channel.send('```ansi\n\x1b[32m> Step 2: Announcing new challenge...\x1b[0m\n```');
            await announcer.announceNewChallenge();

            const embed = new TerminalEmbed()
                .setTerminalTitle('MONTHLY CYCLE TEST')
                .setTerminalDescription('[TEST COMPLETE]\n[VERIFY RESULTS]')
                .addTerminalField('TEST ACTIONS', 
                    '1. Archived current standings\n' +
                    '2. Announced challenge end\n' +
                    '3. Announced new challenge')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !viewarchive <month> to check archive\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Test Month Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Test cycle failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

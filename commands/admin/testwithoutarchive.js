const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'testwithoutarchive',
    description: 'Test monthly announcements without affecting real data',
    async execute(message, args, { announcer }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Initiating announcement test...\x1b[0m\n```');

            const embed = new TerminalEmbed()
                .setTerminalTitle('TEST ANNOUNCEMENTS')
                .setTerminalDescription('[TEST MODE ACTIVE]\n[NO DATA WILL BE MODIFIED]')
                .addTerminalField('SIMULATED ACTIONS', 
                    'The following would happen at month end:\n\n' +
                    '1. Archive current standings\n' +
                    '2. Award points to winners\n' +
                    '3. Switch to next challenge\n' +
                    '4. Make announcements')
                .addTerminalField('CURRENT SETUP',
                    'Current Challenge: <check challenge.json>\n' +
                    'Next Challenge: <check nextChallenge.json>')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Test Without Archive Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Test simulation failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

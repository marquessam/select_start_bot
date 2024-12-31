const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'testwithoutarchive',
    description: 'Test monthly announcements without affecting real data',
    async execute(message, args, { announcer }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Initiating announcement test...\x1b[0m\n```');

            // Get current and next challenge data
            const currentChallenge = await database.getCurrentChallenge();
            const nextChallenge = await database.getNextChallenge();

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
                    `Current Challenge: ${currentChallenge.gameName || '<Not Set>'}\n` +
                    `Next Challenge: ${nextChallenge?.gameName || '<Not Set>'}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Test Without Archive Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Test simulation failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

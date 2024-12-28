// commands/admin/switchchallenge.js
const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'switchchallenge',
    description: 'Manually trigger challenge transition',
    async execute(message, args, { announcer }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Initiating challenge transition...\x1b[0m\n```');
            await announcer.handleNewMonth();

            const embed = new TerminalEmbed()
                .setTerminalTitle('MANUAL CHALLENGE TRANSITION')
                .setTerminalDescription('[TRANSITION COMPLETE]\n[VERIFY NEW CHALLENGE]')
                .addTerminalField('ACTIONS COMPLETED', 
                    '1. Archived previous challenge\n' +
                    '2. Switched to new challenge\n' +
                    '3. Created new template')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Switch Challenge Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to switch challenges\n[Ready for input]█\x1b[0m```');
        }
    }
};
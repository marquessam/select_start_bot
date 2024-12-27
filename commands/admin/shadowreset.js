// commands/admin/shadowreset.js
const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'shadowreset',
    description: 'Resets shadow game progress',
    async execute(message, args, { shadowGame }) {
        try {
            await shadowGame.resetProgress();
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('SHADOW SYSTEM RESET')
                .setTerminalDescription('[RESET COMPLETE]\n[REINITIALIZATION SUCCESS]')
                .addTerminalField('STATUS', 'Shadow game progress has been reset to initial state')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Shadow Reset Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Reset failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

// commands/admin/recheck.js
const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'recheck',
    description: 'Manually trigger achievement checking',
    async execute(message, args, services) {
        try {
            const embed = new TerminalEmbed()
                .setTerminalTitle('ACHIEVEMENT RECHECK')
                .setTerminalDescription('[PROCESSING]')
                .addTerminalField('STATUS', 'Starting achievement recheck...');

            const statusMessage = await message.channel.send({ embeds: [embed] });

            // Trigger achievement check
            await services.achievementFeed.checkNewAchievements();

            // Update status
            embed
                .setTerminalDescription('[COMPLETE]')
                .addTerminalField('RESULT', 'Achievement check completed');

            await statusMessage.edit({ embeds: [embed] });

        } catch (error) {
            console.error('Achievement recheck error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to recheck achievements\n[Ready for input]█\x1b[0m```');
        }
    }
};

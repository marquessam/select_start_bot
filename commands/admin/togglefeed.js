// commands/admin/togglefeed.js

const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'togglefeed',
    description: 'Toggle achievement feed on/off',
    async execute(message, args) {
        try {
            if (!global.achievementFeed) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Achievement feed not initialized\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Toggle the feed state
            global.achievementFeed.isPaused = !global.achievementFeed.isPaused;

            const embed = new TerminalEmbed()
                .setTerminalTitle('ACHIEVEMENT FEED STATUS')
                .setTerminalDescription('[STATUS UPDATE]')
                .addTerminalField('STATUS', 
                    global.achievementFeed.isPaused ? 
                    'Achievement feed is now PAUSED' : 
                    'Achievement feed is now ACTIVE'
                )
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Toggle Feed Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to toggle achievement feed\n[Ready for input]█\x1b[0m```');
        }
    }
};

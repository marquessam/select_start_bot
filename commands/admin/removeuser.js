// commands/admin/removeuser.js
const database = require('../../database');
const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'removeuser',
    description: 'Remove a user from the system',
    async execute(message, args) {
        try {
            if (!args.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Username is required\nUsage: !removeuser <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const username = args[0].toLowerCase();
            await database.removeUser(username);

            const embed = new TerminalEmbed()
                .setTerminalTitle('USER REMOVED')
                .setTerminalDescription('[UPDATE COMPLETE]\n[USER REMOVED FROM DATABASE]')
                .addTerminalField('DETAILS', `USERNAME: ${username}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Remove user error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to remove user\n[Ready for input]█\x1b[0m```');
        }
    }
};

const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'challenge',
    description: 'Shows current monthly challenge',
    async execute(message) {
        const embed = new EmbedBuilder()
            .setColor('#5c3391')
            .setTitle('December 2024 Challenge')
            .setDescription('Final Fantasy Tactics: The War of the Lions')
            .addFields(
                { name: 'Game', value: 'Final Fantasy Tactics: The War of the Lions' },
                { name: 'Period', value: 'December 1st - December 31st, 2024' },
                { name: 'Rules', value: 'All achievements must be earned in Hardcore mode. Any discrepancies or ties will be settled in multiplayer games.' }
            )
            .setFooter({ text: 'Select Start Monthly Challenge' });

        await message.reply({ embeds: [embed] });
    },
};

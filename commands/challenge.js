const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'challenge',
    description: 'Shows current monthly challenge',
    async execute(message) {
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('SELECT START MONTHLY CHALLENGE')
            .setDescription('December 2024 Challenge');

        await message.channel.send({ embeds: [embed] });
    },
};

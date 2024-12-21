const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'challenge',
    description: 'Shows current monthly challenge',
    async execute(message) {
        // First send a console-style prefix
        await message.channel.send('```ansi\n\x1b[32m> Accessing challenge database...\x1b[0m\n```');

        // Create the main embed
        const embed = new EmbedBuilder()
            .setColor('#00FF00')  // Bright green
            .setTitle('████ SELECT START MONTHLY CHALLENGE ████')
            .setURL('https://retroachievements.org/game/3236')  // Link to the game
            .setThumbnail('https://retroachievements.org/Images/017657.png')  // Game icon
            .setDescription('```ansi\n\x1b[32m[CHALLENGE STATUS: ACTIVE]\n[PERIOD: 12.01.2024 - 12.31.2024]\x1b[0m```')
            .addFields(
                { 
                    name: '`MISSION`', 
                    value: '```\nComplete achievements in Final Fantasy Tactics: The War of the Lions```' 
                },
                { 
                    name: '`PARAMETERS`', 
                    value: '```\n- Hardcore mode required\n- All achievements eligible\n- Progress tracked via RetroAchievements.org\n- Multiplayer tiebreaker system active```' 
                }
            )
            .setFooter({ 
                text: '[TERMINAL SESSION: SS-012024]' 
            })
            .setTimestamp();

        // Send the embed
        await message.channel.send({ embeds: [embed] });

        // Send a follow-up console prompt
        await message.channel.send('```ansi\n\x1b[32m> Use !leaderboard to view current rankings...\x1b[0m█\n```');
    },
};

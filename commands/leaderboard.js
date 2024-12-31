const { ActionRowBuilder, SelectMenuBuilder } = require('discord.js');
const TerminalEmbed = require('../utils/embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');
const database = require('../database');

module.exports = {
    name: 'leaderboard',
    description: 'Displays current achievement rankings and allows selection of monthly or yearly leaderboard',
    async execute(message, args, { userStats }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing leaderboard database...\x1b[0m\n```');

            // Create a select menu for leaderboard options
            const row = new ActionRowBuilder().addComponents(
                new SelectMenuBuilder()
                    .setCustomId('leaderboardMenu')
                    .setPlaceholder('Select a leaderboard type')
                    .addOptions([
                        {
                            label: 'Monthly Leaderboard',
                            value: 'monthly',
                            description: 'View the monthly leaderboard',
                        },
                        {
                            label: 'Yearly Leaderboard',
                            value: 'yearly',
                            description: 'View the yearly leaderboard',
                        },
                    ])
            );

            // Send the menu to the user
            await message.channel.send({
                content: 'Choose a leaderboard type:',
                components: [row],
            });

            // Listen for interactions
            const filter = (interaction) => interaction.isSelectMenu() && interaction.customId === 'leaderboardMenu';
            const collector = message.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async (interaction) => {
                if (interaction.values[0] === 'monthly') {
                    // Fetch monthly leaderboard
                    const data = await fetchLeaderboardData();
                    const embed = new TerminalEmbed()
                        .setTerminalTitle('MONTHLY LEADERBOARD')
                        .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
                        .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING MONTHLY RANKINGS]');

                    // Display top participants
                    data.leaderboard.slice(0, 10).forEach((user, index) => {
                        embed.addTerminalField(
                            `${index + 1}. ${user.username}`,
                            `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\nPROGRESS: ${user.completionPercentage}%`
                        );
                    });

                    await interaction.reply({ embeds: [embed] });
                } else if (interaction.values[0] === 'yearly') {
                    // Fetch yearly leaderboard
                    const yearlyLeaderboard = await userStats.getYearlyLeaderboard();
                    const embed = new TerminalEmbed()
                        .setTerminalTitle('YEARLY LEADERBOARD')
                        .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING YEARLY RANKINGS]');

                    // Display top participants
                    yearlyLeaderboard.slice(0, 10).forEach((user, index) => {
                        embed.addTerminalField(
                            `${index + 1}. ${user.username}`,
                            `POINTS: ${user.points}\nGAMES COMPLETED: ${user.gamesCompleted}`
                        );
                    });

                    await interaction.reply({ embeds: [embed] });
                }
            });

            collector.on('end', async () => {
                await message.channel.send('```ansi\n\x1b[32m> Interaction timeout\n[Ready for input]█\x1b[0m```');
            });
        } catch (error) {
            console.error('Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },
};

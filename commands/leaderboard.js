const { MessageActionRow, MessageSelectMenu } = require('discord.js');
const TerminalEmbed = require('../utils/embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');

module.exports = {
    name: 'leaderboard',
    description: 'Displays monthly or yearly achievement rankings',
    async execute(message, args, { userStats }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing leaderboard options...\x1b[0m\n```');

            // Create a dropdown menu for leaderboard options
            const row = new MessageActionRow().addComponents(
                new MessageSelectMenu()
                    .setCustomId('leaderboardMenu')
                    .setPlaceholder('Choose a leaderboard')
                    .addOptions([
                        {
                            label: 'Monthly Leaderboard',
                            description: 'View the current monthly rankings',
                            value: 'monthly',
                        },
                        {
                            label: 'Yearly Leaderboard',
                            description: 'View the current yearly rankings',
                            value: 'yearly',
                        },
                    ])
            );

            // Send the menu to the user
            const menuMessage = await message.channel.send({
                content: 'Please select a leaderboard to display:',
                components: [row],
            });

            // Await user selection
            const filter = (interaction) =>
                interaction.isSelectMenu() && interaction.customId === 'leaderboardMenu' && interaction.user.id === message.author.id;

            const collector = menuMessage.createMessageComponentCollector({
                filter,
                time: 30000, // 30 seconds
            });

            collector.on('collect', async (interaction) => {
                const choice = interaction.values[0];
                await interaction.deferUpdate();

                if (choice === 'monthly') {
                    await this.showMonthlyLeaderboard(message);
                } else if (choice === 'yearly') {
                    await this.showYearlyLeaderboard(message, userStats);
                }

                // Disable the menu after selection
                await menuMessage.edit({ components: [] });
            });

            collector.on('end', async () => {
                if (!collector.ended) {
                    await menuMessage.edit({ components: [] });
                    await message.channel.send('```ansi\n\x1b[31m[ERROR] Menu timed out\n[Ready for input]█\x1b[0m```');
                }
            });
        } catch (error) {
            console.error('Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to display leaderboard options\n[Ready for input]█\x1b[0m```');
        }
    },

    async showMonthlyLeaderboard(message) {
        try {
            const data = await fetchLeaderboardData();

            const embed = new TerminalEmbed()
                .setTerminalTitle('MONTHLY RANKINGS')
                .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING MONTHLY RANKINGS]');

            const rankedLeaderboard = data.leaderboard
                .sort((a, b) => b.completionPercentage - a.completionPercentage)
                .map((user, index, sorted) => ({
                    ...user,
                    rank: index === 0 || user.completionPercentage !== sorted[index - 1].completionPercentage
                        ? index + 1
                        : sorted[index - 1].rank,
                }));

            rankedLeaderboard.forEach((user) => {
                embed.addTerminalField(
                    `${user.rank}. ${user.username}`,
                    `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\nPROGRESS: ${user.completionPercentage}%`
                );
            });

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Monthly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve monthly rankings\n[Ready for input]█\x1b[0m```');
        }
    },

    async showYearlyLeaderboard(message, userStats) {
        try {
            const validUsers = await userStats.getAllUsers();
            const leaderboard = await userStats.getYearlyLeaderboard();

            const rankedLeaderboard = leaderboard
                .filter((user) => validUsers.includes(user.username.toLowerCase()))
                .sort((a, b) => b.points - a.points)
                .map((user, index, sorted) => ({
                    ...user,
                    rank: index === 0 || user.points !== sorted[index - 1].points
                        ? index + 1
                        : sorted[index - 1].rank,
                }));

            const embed = new TerminalEmbed()
                .setTerminalTitle('YEARLY RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING YEARLY RANKINGS]');

            rankedLeaderboard.forEach((user) => {
                embed.addTerminalField(
                    `${user.rank}. ${user.username}`,
                    `POINTS: ${user.points}`
                );
            });

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Yearly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly rankings\n[Ready for input]█\x1b[0m```');
        }
    },
};

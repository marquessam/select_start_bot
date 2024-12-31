const TerminalEmbed = require('../utils/embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');
const { MessageActionRow, MessageSelectMenu } = require('discord.js');

module.exports = {
    name: 'leaderboard',
    description: 'Displays monthly or yearly achievement rankings',
    async execute(message, args, { userStats }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing leaderboard options...\x1b[0m\n```');

            // Create a dropdown menu for the leaderboard options
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
                .setTerminalTitle('MONTHLY LEADERBOARD')
                .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING MONTHLY RANKINGS]');

            // Handle ties in the leaderboard
            let currentRank = 1;
            let lastPercentage = null;
            let tieFlag = false;

            const rankedUsers = data.leaderboard.map((user, index) => {
                if (user.completionPercentage !== lastPercentage) {
                    currentRank = index + 1;
                    tieFlag = false;
                    lastPercentage = user.completionPercentage;
                } else {
                    tieFlag = true;
                }
                return { ...user, rank: currentRank, tie: tieFlag };
            });

            // Top 3 users
            rankedUsers.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const tieText = user.tie ? ' (tie)' : '';
                embed.addTerminalField(
                    `${medals[index]} ${user.username} (RANK: ${user.rank}${tieText})`,
                    `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\nPROGRESS: ${user.completionPercentage}%`
                );
            });

            // Additional participants
            const additionalUsers = rankedUsers.slice(3);
            if (additionalUsers.length > 0) {
                const additionalRankings = additionalUsers
                    .map(user => {
                        const tieText = user.tie ? ' (tie)' : '';
                        return `${user.rank}. ${user.username} (${user.completionPercentage}%${tieText})`;
                    })
                    .join('\n');

                embed.addTerminalField('ADDITIONAL PARTICIPANTS', additionalRankings);
            }

            embed.setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Monthly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to display monthly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },

    async showYearlyLeaderboard(message, userStats) {
        try {
            const validUsers = await userStats.getAllUsers();
            const leaderboard = await userStats.getYearlyLeaderboard();

            // Filter leaderboard to include only valid users
            const filteredLeaderboard = leaderboard.filter(user =>
                validUsers.includes(user.username.toLowerCase())
            );

            // Handle ties in the leaderboard
            let currentRank = 1;
            let currentPoints = -1;
            let sameRankCount = 0;

            const rankedLeaderboard = filteredLeaderboard.map((user, index) => {
                if (user.points !== currentPoints) {
                    currentRank += sameRankCount;
                    sameRankCount = 0;
                    currentPoints = user.points;
                } else {
                    sameRankCount++;
                }
                return { ...user, rank: currentRank };
            });

            const embed = new TerminalEmbed()
                .setTerminalTitle('YEARLY LEADERBOARD')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT YEARLY RANKINGS]');

            if (rankedLeaderboard.length > 0) {
                embed.addTerminalField(
                    'TOP OPERATORS',
                    rankedLeaderboard
                        .map(user => `${user.rank}. ${user.username}: ${user.points} points`)
                        .join('\n')
                );
            } else {
                embed.addTerminalField('STATUS', 'No rankings available');
            }

            embed.setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Yearly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to display yearly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },
};

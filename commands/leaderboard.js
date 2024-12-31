const TerminalEmbed = require('../utils/embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');

module.exports = {
    name: 'leaderboard',
    description: 'Displays monthly or yearly rankings. Use "!leaderboard month" or "!leaderboard year".',
    async execute(message, args, { userStats }) {
        try {
            const option = args[0]?.toLowerCase();

            if (!option || !['month', 'year'].includes(option)) {
                await message.channel.send('```ansi\n\x1b[32m[LEADERBOARD OPTIONS]\n1. Input "!leaderboard month" for the monthly leaderboard\n2. Input "!leaderboard year" for the yearly leaderboard\n[Ready for input]█\x1b[0m```');
                return;
            }

            if (option === 'month') {
                // Fetch and display monthly leaderboard
                await message.channel.send('```ansi\n\x1b[32m> Accessing monthly leaderboard...\x1b[0m\n```');
                const data = await fetchLeaderboardData();

                const embed = new TerminalEmbed()
                    .setTerminalTitle('MONTHLY LEADERBOARD')
                    .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
                    .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING MONTHLY RANKINGS]');

                // Calculate ranks considering ties
                const leaderboardWithTies = data.leaderboard
                    .sort((a, b) => b.completionPercentage - a.completionPercentage)
                    .map((user, index, sorted) => ({
                        ...user,
                        rank: index > 0 && sorted[index - 1].completionPercentage === user.completionPercentage
                            ? sorted[index - 1].rank
                            : index + 1
                    }));

                // Display top 3 with medals
                leaderboardWithTies.slice(0, 3).forEach((user, index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    embed.addTerminalField(
                        `${medals[index]} ${user.username}`,
                        `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\nPROGRESS: ${user.completionPercentage}%`
                    );
                });

                // Additional participants
                const additionalUsers = leaderboardWithTies.slice(3);
                if (additionalUsers.length > 0) {
                    const additionalRankings = additionalUsers
                        .map(user =>
                            `${user.rank}. ${user.username} (${user.completionPercentage}%)`
                        )
                        .join('\n');

                    embed.addTerminalField('ADDITIONAL PARTICIPANTS', additionalRankings);
                }

                embed.setTerminalFooter();
                await message.channel.send({ embeds: [embed] });
            } else if (option === 'year') {
                // Fetch and display yearly leaderboard
                await message.channel.send('```ansi\n\x1b[32m> Accessing yearly leaderboard...\x1b[0m\n```');
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

                embed.setTerminalFooter();
                await message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },
};

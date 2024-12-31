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

                // Display top participants
                data.leaderboard.slice(0, 10).forEach((user, index) => {
                    embed.addTerminalField(
                        `${index + 1}. ${user.username}`,
                        `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\nPROGRESS: ${user.completionPercentage}%`
                    );
                });

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

                await message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },
};

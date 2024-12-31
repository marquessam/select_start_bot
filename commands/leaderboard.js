const TerminalEmbed = require('../utils/embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');

module.exports = {
    name: 'leaderboard',
    description: 'Displays achievement rankings for the current challenge',
    async execute(message, args, { userStats }) {
        try {
            const leaderboardType = args[0]?.toLowerCase();

            if (!leaderboardType || (leaderboardType !== 'month' && leaderboardType !== 'year')) {
                await message.channel.send(
                    '```ansi\n\x1b[32m> Please specify a leaderboard type:\n' +
                    '1. Use `!leaderboard month` for the monthly challenge leaderboard\n' +
                    '2. Use `!leaderboard year` for the yearly challenge leaderboard\n' +
                    '[Ready for input]█\x1b[0m```'
                );
                return;
            }

            if (leaderboardType === 'month') {
                await message.channel.send('```ansi\n\x1b[32m> Accessing monthly rankings...\x1b[0m\n```');

                const data = await fetchLeaderboardData();
                const embed = new TerminalEmbed()
                    .setTerminalTitle('MONTHLY RANKINGS')
                    .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
                    .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING MONTHLY RANKINGS]');

                const sortedLeaderboard = data.leaderboard.sort((a, b) => b.completionPercentage - a.completionPercentage);

                // Display top 3 participants with medals
                sortedLeaderboard.slice(0, 3).forEach((user, index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    embed.addTerminalField(
                        `${medals[index]} ${user.username}`,
                        `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\n` +
                        `PROGRESS: ${user.completionPercentage}%`
                    );
                });

                // List all other participants without ranks
                const additionalUsers = sortedLeaderboard.slice(3);
                if (additionalUsers.length > 0) {
                    const participantList = additionalUsers
                        .map(user => `${user.username} (${user.completionPercentage}%)`)
                        .join('\n');

                    embed.addTerminalField('ALL PARTICIPANTS', participantList);
                }

                embed.setTerminalFooter();
                await message.channel.send({ embeds: [embed] });
            }

            if (leaderboardType === 'year') {
                await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');

                const validUsers = await userStats.getAllUsers();
                const leaderboard = await userStats.getYearlyLeaderboard(null, validUsers);

                let currentRank = 1;
                let currentPoints = -1;
                let sameRankCount = 0;

                const rankedLeaderboard = leaderboard.map((user, index) => {
                    if (user.points !== currentPoints) {
                        currentRank += sameRankCount;
                        sameRankCount = 0;
                        currentPoints = user.points;
                    } else {
                        sameRankCount++;
                    }
                    return {
                        ...user,
                        rank: currentRank
                    };
                });

                const embed = new TerminalEmbed()
                    .setTerminalTitle('YEARLY RANKINGS')
                    .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING YEARLY RANKINGS]');

                if (rankedLeaderboard.length > 0) {
                    embed.addTerminalField('TOP OPERATORS',
                        rankedLeaderboard
                            .map(user => `${user.rank}. ${user.username}: ${user.points} points`)
                            .join('\n'));
                } else {
                    embed.addTerminalField('STATUS', 'No rankings available');
                }

                embed.setTerminalFooter();
                await message.channel.send({ embeds: [embed] });
            }

            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve rankings\n[Ready for input]█\x1b[0m```');
        }
    }
};

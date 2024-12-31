const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
    name: 'yearlyboard',
    description: 'Displays yearly rankings',
    async execute(message, args, { userStats }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');

            // Fetch all users and yearly leaderboard
            const [validUsers, leaderboard] = await Promise.all([
                userStats.getAllUsers(),
                userStats.getYearlyLeaderboard()
            ]);

            // Filter leaderboard to only include valid users
            const filteredLeaderboard = leaderboard.filter(user =>
                validUsers.includes(user.username.toLowerCase())
            );

            if (filteredLeaderboard.length === 0) {
                throw new Error('No valid users or leaderboard data found.');
            }

            // Calculate ranks considering ties
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
                return {
                    ...user,
                    rank: currentRank
                };
            });

            // Build the embed
            const embed = new TerminalEmbed()
                .setTerminalTitle('YEARLY RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

            if (rankedLeaderboard.length > 0) {
                const topOperators = rankedLeaderboard
                    .map(user => `${user.rank}. ${user.username}: ${user.points} points`)
                    .join('\n');
                embed.addTerminalField('TOP OPERATORS', topOperators);
            } else {
                embed.addTerminalField('STATUS', 'No rankings available');
            }

            embed.setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Yearly Rankings Error:', error.message);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly rankings\n[Ready for input]█\x1b[0m```');
        }
    }
};

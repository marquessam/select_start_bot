const TerminalEmbed = require('../utils/embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');

module.exports = {
    name: 'leaderboard',
    description: 'Displays current achievement rankings',
    async execute(message, args, { shadowGame }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing achievement database...\x1b[0m\n```');

            const data = await fetchLeaderboardData();

            const embed = new TerminalEmbed()
                .setTerminalTitle('USER RANKINGS')
                .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]');

            // Calculate ranks with tie handling
            let currentRank = 1;
            let lastPercentage = null;
            let sameRankCount = 0;

            const rankedUsers = data.leaderboard.map((user, index) => {
                if (user.completionPercentage !== lastPercentage) {
                    currentRank += sameRankCount; // Increment rank only when percentage changes
                    sameRankCount = 0; // Reset tie count
                    lastPercentage = user.completionPercentage; // Update last percentage
                } else {
                    sameRankCount++; // Increment tie count
                }
                return { ...user, rank: currentRank };
            });

            // Top 3 users with medals
            rankedUsers.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const tieText = sameRankCount > 0 ? ' (tie)' : '';
                embed.addTerminalField(
                    `${medals[index]} ${user.username} (RANK: ${user.rank}${tieText})`,
                    `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\nPROGRESS: ${user.completionPercentage}%`
                );
            });

            // Additional participants with adjusted ranks
            const additionalUsers = rankedUsers.slice(3);
            if (additionalUsers.length > 0) {
                const additionalRankings = additionalUsers
                    .map(user => `${user.rank}. ${user.username} (${user.completionPercentage}%)`)
                    .join('\n');
                    
                embed.addTerminalField(
                    'ADDITIONAL PARTICIPANTS',
                    additionalRankings
                );
            }

            embed.setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\n[Ready for input]█\x1b[0m```');
            await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Database sync failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

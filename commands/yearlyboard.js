module.exports = {
    name: 'yearlyboard',
    description: 'Displays yearly rankings',
    async execute(message, args, { userStats }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');
            
            console.log('[DEBUG] Fetching all participants...');
            const validUsers = await userStats.getAllUsers();
            console.log('[DEBUG] Valid users:', validUsers);

            console.log('[DEBUG] Fetching yearly leaderboard...');
            const leaderboard = await userStats.getYearlyLeaderboard(null, validUsers);
            console.log('[DEBUG] Yearly leaderboard:', leaderboard);

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
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

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
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Yearly Rankings Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly rankings\n[Ready for input]█\x1b[0m```');
        }
    }
};


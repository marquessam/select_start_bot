const TerminalEmbed = require('../utils/embedBuilder');
const leaderboardCache = require('../leaderboardCache');
const database = require('../database');

module.exports = {
    name: 'profile',
    description: 'Displays enhanced user profile and stats',
    async execute(message, args, { userStats }) {
        try {
            const username = args[0];
            if (!username) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            const currentYear = new Date().getFullYear().toString();
            const monthlyLeaderboard = leaderboardCache.getMonthlyLeaderboard();
            const yearlyLeaderboard = leaderboardCache.getYearlyLeaderboard();

            // Fetch user stats
            const stats = await userStats.getUserStats(username);

            // Find user's monthly rank
            const monthlyRankData = monthlyLeaderboard.find((user) => user.username.toLowerCase() === username.toLowerCase());
            const monthlyRank = monthlyLeaderboard.findIndex((user) => user.username.toLowerCase() === username.toLowerCase()) + 1;
            const monthlyRankText = monthlyRankData
                ? `${monthlyRank}/${monthlyLeaderboard.length}${monthlyRank > 1 ? ' (tie)' : ''}`
                : 'N/A';

            // Find user's yearly rank
            const yearlyRankData = yearlyLeaderboard.find((user) => user.username.toLowerCase() === username.toLowerCase());
            const yearlyRank = yearlyLeaderboard.findIndex((user) => user.username.toLowerCase() === username.toLowerCase()) + 1;
            const yearlyRankText = yearlyRankData
                ? `${yearlyRank}/${yearlyLeaderboard.length}${yearlyRank > 1 ? ' (tie)' : ''}`
                : 'N/A';

            // Build the profile embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${leaderboardCache.getMonthlyGame() || 'N/A'}\n` +
                    `PROGRESS: ${monthlyRankData?.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${monthlyRankData?.completedAchievements || 0}/${monthlyRankData?.totalAchievements || 0}`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRankText}\n` +
                    `YEARLY RANK: ${yearlyRankText}`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `YEARLY POINTS: ${stats.yearlyPoints[currentYear] || 0}\n` +
                    `GAMES COMPLETED: ${stats.yearlyStats?.[currentYear]?.totalGamesCompleted || 0}\n` +
                    `ACHIEVEMENTS UNLOCKED: ${stats.yearlyStats?.[currentYear]?.totalAchievementsUnlocked || 0}\n` +
                    `HARDCORE COMPLETIONS: ${stats.yearlyStats?.[currentYear]?.hardcoreCompletions || 0}\n` +
                    `MONTHLY PARTICIPATIONS: ${stats.yearlyStats?.[currentYear]?.monthlyParticipations || 0}`);

            const recentBonusPoints = (stats.bonusPoints || [])
                .filter((bonus) => bonus.year === currentYear)
                .map((bonus) => `${bonus.reason}: ${bonus.points} pts`)
                .join('\n');

            const totalBonusPoints = stats.bonusPoints.reduce((acc, bonus) => acc + bonus.points, 0);
            embed.addTerminalField('POINTS', `${recentBonusPoints}\nTotal: ${totalBonusPoints} pts`);
            embed.setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    },
};

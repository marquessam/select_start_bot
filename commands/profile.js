const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');
const leaderboardCache = require('../leaderboardCache');

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
            const stats = await userStats.getUserStats(username);
            const currentChallenge = await database.getCurrentChallenge();

            // Fetch cached leaderboards
            const yearlyLeaderboard = leaderboardCache.getYearlyLeaderboard();
            const monthlyLeaderboard = leaderboardCache.getMonthlyLeaderboard();

            if (!yearlyLeaderboard || !monthlyLeaderboard) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Leaderboard data not available. Please try again later.\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Find user's yearly rank
            const yearlyUser = yearlyLeaderboard.find(u => u.username.toLowerCase() === username.toLowerCase());
            const yearlyRankText = yearlyUser
                ? `${yearlyUser.rank}/${yearlyLeaderboard.length} (tie)`
                : 'N/A';

            // Find user's monthly rank
            const monthlyUser = monthlyLeaderboard.find(u => u.username.toLowerCase() === username.toLowerCase());
            const monthlyRankText = monthlyUser
                ? `${monthlyUser.rank}/${monthlyLeaderboard.length}${monthlyUser.tie ? ' (tie)' : ''}`
                : 'N/A';

            // Construct profile embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge.gameName}\n` +
                    `PROGRESS: ${monthlyUser?.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${monthlyUser?.completedAchievements || 0}/` +
                    `${monthlyUser?.totalAchievements || 0}`)
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
                .filter(bonus => bonus.year === currentYear)
                .map(bonus => `${bonus.reason}: ${bonus.points} pts`)
                .join('\n');

            const totalBonusPoints = stats.bonusPoints
                .filter(bonus => bonus.year === currentYear)
                .reduce((acc, bonus) => acc + bonus.points, 0);

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

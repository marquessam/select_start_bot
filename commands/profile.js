const TerminalEmbed = require('../utils/embedBuilder');
const leaderboardCache = require('../leaderboardCache');
const { fetchUserProfile } = require('../raAPI'); // Import the function to fetch RetroAchievements profile data

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

            // Get cached leaderboards
            const yearlyLeaderboard = leaderboardCache.getYearlyLeaderboard();
            const monthlyLeaderboard = leaderboardCache.getMonthlyLeaderboard();

            if (!yearlyLeaderboard || !monthlyLeaderboard) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Leaderboard data not available. Try again later.\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Fetch RetroAchievements profile data
            const raProfile = await fetchUserProfile(username);

            // Calculate yearly rank
            let currentYearRank = 1;
            let lastPoints = -1;
            const rankedYearlyLeaderboard = yearlyLeaderboard.map((user, index) => {
                if (user.points !== lastPoints) {
                    currentYearRank = index + 1;
                    lastPoints = user.points;
                }
                return { ...user, rank: currentYearRank };
            });

            const userYearlyData = rankedYearlyLeaderboard.find(user => user.username.toLowerCase() === username.toLowerCase());
            const yearlyRankText = userYearlyData
                ? `${userYearlyData.rank}/${rankedYearlyLeaderboard.length} (tie)`
                : 'N/A';

            // Calculate monthly rank
            let currentMonthlyRank = 1;
            let lastCompletion = -1;
            const rankedMonthlyLeaderboard = monthlyLeaderboard.map((user, index) => {
                if (user.completionPercentage !== lastCompletion) {
                    currentMonthlyRank = index + 1;
                    lastCompletion = user.completionPercentage;
                }
                return { ...user, rank: currentMonthlyRank };
            });

            const userMonthlyData = rankedMonthlyLeaderboard.find(user => user.username.toLowerCase() === username.toLowerCase());
            const monthlyRankText = userMonthlyData
                ? `${userMonthlyData.rank}/${rankedMonthlyLeaderboard.length} (tie)`
                : 'N/A';

            // Construct profile embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRankText}\n` +
                    `YEARLY RANK: ${yearlyRankText}`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `YEARLY POINTS: ${userYearlyData?.points || 0}\n` +
                    `GAMES COMPLETED: ${userYearlyData?.gamesCompleted || 0}\n` +
                    `ACHIEVEMENTS UNLOCKED: ${userYearlyData?.achievementsUnlocked || 0}`)
                .setThumbnail(raProfile?.profileIcon || '') // Add the RetroAchievements profile icon if available
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    },
};

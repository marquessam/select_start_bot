const TerminalEmbed = require('../utils/embedBuilder');
const leaderboardCache = require('../leaderboardCache');
const { fetchUserProfile } = require('../raAPI');
const database = require('../database');

module.exports = {
    name: 'profile',
    description: 'Displays enhanced user profile and stats',
    async execute(message, args) {
        try {
            const username = args[0];
            if (!username) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            const currentYear = new Date().getFullYear().toString();

            // Fetch data from leaderboard cache and user profile
            const yearlyLeaderboard = leaderboardCache.getYearlyLeaderboard() || [];
            const monthlyLeaderboard = leaderboardCache.getMonthlyLeaderboard() || [];
            const userProfile = await fetchUserProfile(username);
            const userStats = await database.getUserStats(username);

            // Find user's rank and stats in leaderboards
            const yearlyRank = yearlyLeaderboard.findIndex(user => user.username.toLowerCase() === username.toLowerCase()) + 1;
            const monthlyRank = monthlyLeaderboard.findIndex(user => user.username.toLowerCase() === username.toLowerCase()) + 1;

            const yearlyRankText = yearlyRank
                ? `${yearlyRank}/${yearlyLeaderboard.length} (tie)`
                : 'N/A';

            const monthlyRankText = monthlyRank
                ? `${monthlyRank}/${monthlyLeaderboard.length} (tie)`
                : 'N/A';

            // Filter bonus points for the current year
            const recentBonusPoints = (userStats.bonusPoints || [])
                .filter(bonus => bonus.year === currentYear)
                .map(bonus => `${bonus.reason}: ${bonus.points} pts`)
                .join('\n');

            const totalBonusPoints = (userStats.bonusPoints || [])
                .filter(bonus => bonus.year === currentYear)
                .reduce((acc, bonus) => acc + bonus.points, 0);

            // Construct profile embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${leaderboardCache.getMonthlyGame()?.Title || 'N/A'}\n` +
                    `PROGRESS: ${monthlyLeaderboard.find(user => user.username.toLowerCase() === username.toLowerCase())?.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${monthlyLeaderboard.find(user => user.username.toLowerCase() === username.toLowerCase())?.completedAchievements || 0}/` +
                    `${monthlyLeaderboard.find(user => user.username.toLowerCase() === username.toLowerCase())?.totalAchievements || 0}`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRankText}\n` +
                    `YEARLY RANK: ${yearlyRankText}`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `YEARLY POINTS: ${userStats.yearlyPoints[currentYear] || 0}\n` +
                    `GAMES COMPLETED: ${userStats.yearlyStats?.[currentYear]?.totalGamesCompleted || 0}\n` +
                    `ACHIEVEMENTS UNLOCKED: ${userStats.yearlyStats?.[currentYear]?.totalAchievementsUnlocked || 0}\n` +
                    `HARDCORE COMPLETIONS: ${userStats.yearlyStats?.[currentYear]?.hardcoreCompletions || 0}\n` +
                    `MONTHLY PARTICIPATIONS: ${userStats.yearlyStats?.[currentYear]?.monthlyParticipations || 0}`)
                .addTerminalField('POINTS', `${recentBonusPoints}\nTotal: ${totalBonusPoints} pts`);

            if (userProfile.profileImage && userProfile.profileImage.startsWith('http')) {
                embed.setThumbnail(userProfile.profileImage);
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    },
};

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

            // Fetch data from leaderboard cache, user profile, and current challenge
            const yearlyLeaderboard = leaderboardCache.getYearlyLeaderboard() || [];
            const monthlyLeaderboard = leaderboardCache.getMonthlyLeaderboard() || [];
            const userProfile = await fetchUserProfile(username);
            const userStats = await database.getUserStats(username);
            const currentChallenge = await database.getCurrentChallenge();

            // Ensure stats exist for the current year
            const yearlyPoints = userStats.yearlyPoints?.[currentYear] || 0;
            const yearlyStats = userStats.yearlyStats?.[currentYear] || {
                totalGamesCompleted: 0,
                totalAchievementsUnlocked: 0,
                hardcoreCompletions: 0,
                monthlyParticipations: 0,
            };

            // Determine user's rank and handle ties
            let currentRank = 1;
            let tieCount = 0;
            let lastPoints = -1;

            const rankedYearlyLeaderboard = yearlyLeaderboard.map((user, index) => {
                if (user.points !== lastPoints) {
                    currentRank += tieCount;
                    tieCount = 0;
                    lastPoints = user.points;
                } else {
                    tieCount++;
                }

                return {
                    ...user,
                    rank: currentRank,
                };
            });

            const userYearlyData = rankedYearlyLeaderboard.find(user => user.username.toLowerCase() === username.toLowerCase());
            const yearlyRankText = userYearlyData
                ? `${userYearlyData.rank}/${rankedYearlyLeaderboard.length} (tie)`
                : 'N/A';

            // Determine monthly data
            const monthlyData = monthlyLeaderboard.find(user => user.username.toLowerCase() === username.toLowerCase()) || {
                completionPercentage: 0,
                completedAchievements: 0,
                totalAchievements: 0,
            };

            const monthlyRank = monthlyLeaderboard.findIndex(user => user.username.toLowerCase() === username.toLowerCase());
            const monthlyRankText = monthlyRank >= 0
                ? `${monthlyRank + 1}/${monthlyLeaderboard.length} (tie)`
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
                    `GAME: ${currentChallenge?.gameName || 'N/A'}\n` +
                    `PROGRESS: ${monthlyData.completionPercentage}%\n` +
                    `ACHIEVEMENTS: ${monthlyData.completedAchievements}/${monthlyData.totalAchievements}`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRankText}\n` +
                    `YEARLY RANK: ${yearlyRankText}`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `YEARLY POINTS: ${yearlyPoints}\n` +
                    `GAMES COMPLETED: ${yearlyStats.totalGamesCompleted}\n` +
                    `ACHIEVEMENTS UNLOCKED: ${yearlyStats.totalAchievementsUnlocked}\n` +
                    `HARDCORE COMPLETIONS: ${yearlyStats.hardcoreCompletions}\n` +
                    `MONTHLY PARTICIPATIONS: ${yearlyStats.monthlyParticipations}`)
                .addTerminalField('POINTS', `${recentBonusPoints}\nTotal: ${totalBonusPoints} pts`);

            if (userProfile?.profileImage?.startsWith('http')) {
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

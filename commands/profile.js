const TerminalEmbed = require('../utils/embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');
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

            // Fetch participants and all necessary data
            const allParticipants = await userStats.getAllUsers();
            const [data, yearlyLeaderboard, stats, currentChallenge] = await Promise.all([
                fetchLeaderboardData(),
                userStats.getYearlyLeaderboard(currentYear, allParticipants),
                userStats.getUserStats(username),
                database.getCurrentChallenge(),
            ]);

            // Ensure the yearly leaderboard includes all participants
            const adjustedYearlyLeaderboard = allParticipants.map(participant => {
                const user = yearlyLeaderboard.find(u => u.username.toLowerCase() === participant.toLowerCase());
                return user || { username: participant, points: 0 };
            });

            // Calculate yearly rank with ties
            let currentRank = 1;
            let sameRankCount = 0;
            let lastPoints = -1;
            const rankedYearlyLeaderboard = adjustedYearlyLeaderboard.map((user, index) => {
                if (user.points !== lastPoints) {
                    currentRank += sameRankCount;
                    sameRankCount = 0;
                    lastPoints = user.points;
                } else {
                    sameRankCount++;
                }
                return { ...user, rank: currentRank };
            });

            const userYearlyData = rankedYearlyLeaderboard.find(user => user.username.toLowerCase() === username.toLowerCase());
            const yearlyRankText = userYearlyData
                ? `${userYearlyData.rank}/${rankedYearlyLeaderboard.length} (tie)`
                : 'N/A';

            // Ensure the monthly leaderboard includes all participants
            data.leaderboard = allParticipants.map(participant => {
                const user = data.leaderboard.find(u => u.username.toLowerCase() === participant.toLowerCase());
                return user || { username: participant, completionPercentage: 0, completedAchievements: 0, totalAchievements: 0 };
            });

            // Calculate monthly rank with ties
            const monthlyRankData = data.leaderboard
                .sort((a, b) => b.completionPercentage - a.completionPercentage)
                .reduce((acc, user, index, sorted) => {
                    if (index === 0 || user.completionPercentage !== sorted[index - 1].completionPercentage) {
                        acc.currentRank = index + 1;
                    }
                    acc.rankedUsers.push({
                        ...user,
                        rank: acc.currentRank,
                        tie: index > 0 && user.completionPercentage === sorted[index - 1].completionPercentage,
                    });
                    return acc;
                }, { currentRank: 1, rankedUsers: [] });

            const monthlyRank = monthlyRankData.rankedUsers.find(user => user.username.toLowerCase() === username.toLowerCase());
            const monthlyRankText = monthlyRank
                ? `${monthlyRank.rank}/${data.leaderboard.length}${monthlyRank.tie ? ' (tie)' : ''}`
                : 'N/A';

            // Filter bonus points for the current year
            const recentBonusPoints = (stats.bonusPoints || [])
                .filter(bonus => bonus.year === currentYear)
                .map(bonus => `${bonus.reason}: ${bonus.points} pts`)
                .join('\n');

            const totalBonusPoints = stats.bonusPoints
                .filter(bonus => bonus.year === currentYear)
                .reduce((acc, bonus) => acc + bonus.points, 0);

            // Construct profile embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge.gameName}\n` +
                    `PROGRESS: ${data.leaderboard.find(user => user.username.toLowerCase() === username.toLowerCase())?.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${data.leaderboard.find(user => user.username.toLowerCase() === username.toLowerCase())?.completedAchievements || 0}/` +
                    `${data.leaderboard.find(user => user.username.toLowerCase() === username.toLowerCase())?.totalAchievements || 0}`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRankText}\n` +
                    `YEARLY RANK: ${yearlyRankText}`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `YEARLY POINTS: ${stats.yearlyPoints[currentYear] || 0}\n` +
                    `GAMES COMPLETED: ${stats.yearlyStats?.[currentYear]?.totalGamesCompleted || 0}\n` +
                    `ACHIEVEMENTS UNLOCKED: ${stats.yearlyStats?.[currentYear]?.totalAchievementsUnlocked || 0}\n` +
                    `HARDCORE COMPLETIONS: ${stats.yearlyStats?.[currentYear]?.hardcoreCompletions || 0}\n` +
                    `MONTHLY PARTICIPATIONS: ${stats.yearlyStats?.[currentYear]?.monthlyParticipations || 0}`)
                .addTerminalField('POINTS', `${recentBonusPoints}\nTotal: ${totalBonusPoints} pts`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    },
};

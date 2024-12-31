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

            // Fetch participants from Google Sheet
            const allParticipants = await userStats.refreshUserList();

            // Get all necessary data
            const [data, yearlyLeaderboard, stats, currentChallenge] = await Promise.all([
                fetchLeaderboardData(),
                userStats.getYearlyLeaderboard(currentYear, allParticipants),
                userStats.getUserStats(username),
                database.getCurrentChallenge()
            ]);

            // Ensure the monthly leaderboard includes all participants
            data.leaderboard = allParticipants.map(participant => {
                const user = data.leaderboard.find(u => u.username.toLowerCase() === participant.toLowerCase());
                return user || { username: participant, completionPercentage: 0, completedAchievements: 0, totalAchievements: 0 };
            });

            // Calculate monthly rank with ties
            const monthlyRankData = data.leaderboard
                .sort((a, b) => b.completionPercentage - a.completionPercentage)
                .map((user, index, sorted) => {
                    return {
                        username: user.username,
                        rank: index + 1,
                        tie: index > 0 && sorted[index - 1].completionPercentage === user.completionPercentage
                    };
                });

            const monthlyRank = monthlyRankData.find(user => user.username.toLowerCase() === username.toLowerCase());
            const monthlyRankText = monthlyRank
                ? `${monthlyRank.rank}/${data.leaderboard.length}${monthlyRank.tie ? ' (tie)' : ''}`
                : 'N/A';

            // Calculate yearly rank with ties
            const yearlyRankData = yearlyLeaderboard.map((user, index, sorted) => {
                return {
                    username: user.username,
                    rank: index + 1,
                    tie: index > 0 && sorted[index - 1].points === user.points
                };
            });

            const yearlyRank = yearlyRankData.find(user => user.username.toLowerCase() === username.toLowerCase());
            const yearlyRankText = yearlyRank
                ? `${yearlyRank.rank}/${yearlyLeaderboard.length}${yearlyRank.tie ? ' (tie)' : ''}`
                : 'N/A';

            // Find user's profile info in leaderboard data
            const userLeaderboardData = data.leaderboard.find(user => 
                user.username.toLowerCase() === username.toLowerCase()
            );

            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]');

            if (userLeaderboardData?.profileImage) {
                embed.setThumbnail(userLeaderboardData.profileImage);
            }

            if (userLeaderboardData) {
                embed.addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge.gameName}\n` +
                    `PROGRESS: ${userLeaderboardData.completionPercentage}%\n` +
                    `ACHIEVEMENTS: ${userLeaderboardData.completedAchievements}/${userLeaderboardData.totalAchievements}`
                );
            }

            embed.addTerminalField('RANKINGS',
                `MONTHLY RANK: ${monthlyRankText}\n` +
                `YEARLY RANK: ${yearlyRankText}`
            );

            embed.addTerminalField(`${currentYear} STATISTICS`,
                `YEARLY POINTS: ${stats.yearlyPoints[currentYear] || 0}\n` +
                `GAMES COMPLETED: ${stats.yearlyStats?.[currentYear]?.totalGamesCompleted || 0}\n` +
                `ACHIEVEMENTS UNLOCKED: ${stats.yearlyStats?.[currentYear]?.totalAchievementsUnlocked || 0}\n` +
                `HARDCORE COMPLETIONS: ${stats.yearlyStats?.[currentYear]?.hardcoreCompletions || 0}\n` +
                `MONTHLY PARTICIPATIONS: ${stats.yearlyStats?.[currentYear]?.monthlyParticipations || 0}`
            );

            // Add bonus points if any
            const recentBonusPoints = (stats.bonusPoints || [])
                .filter(bonus => bonus.year === currentYear)
                .map(bonus => `${bonus.reason}: ${bonus.points} pts`)
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
    }
};

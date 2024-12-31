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

            // Get all necessary data
            const [data, yearlyLeaderboard, stats, currentChallenge] = await Promise.all([
                fetchLeaderboardData(),
                userStats.getYearlyLeaderboard(),
                userStats.getUserStats(username),
                database.getCurrentChallenge()
            ]);

            const yearlyPoints = stats.yearlyPoints[currentYear] || 0;

            // Calculate yearly rank with ties
            const yearlyRankData = yearlyLeaderboard.reduce((acc, user, index) => {
                if (index === 0 || user.points !== yearlyLeaderboard[index - 1].points) {
                    acc.currentRank = index + 1;
                }
                if (user.username.toLowerCase() === username.toLowerCase()) {
                    acc.rank = acc.currentRank;
                }
                return acc;
            }, { currentRank: 1, rank: null });

            // Calculate monthly rank with ties
            const monthlyRankData = data.leaderboard.reduce((acc, user, index) => {
                if (index === 0 || user.completionPercentage !== data.leaderboard[index - 1].completionPercentage) {
                    acc.currentRank = index + 1;
                }
                if (user.username.toLowerCase() === username.toLowerCase()) {
                    acc.rank = acc.currentRank;
                }
                return acc;
            }, { currentRank: 1, rank: null });

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

            embed.addTerminalField(`${currentYear} STATISTICS`,
                `YEARLY POINTS: ${yearlyPoints}\n` +
                `YEARLY RANK: ${yearlyRankData.rank || 'N/A'}/${yearlyLeaderboard.length}\n` +
                `MONTHLY RANK: ${monthlyRankData.rank || 'N/A'}/${data.leaderboard.length}\n` +
                `GAMES COMPLETED: ${stats.yearlyStats?.[currentYear]?.totalGamesCompleted || 0}\n` +
                `ACHIEVEMENTS UNLOCKED: ${stats.yearlyStats?.[currentYear]?.totalAchievementsUnlocked || 0}\n` +
                `HARDCORE COMPLETIONS: ${stats.yearlyStats?.[currentYear]?.hardcoreCompletions || 0}\n` +
                `MONTHLY PARTICIPATIONS: ${stats.yearlyStats?.[currentYear]?.monthlyParticipations || 0}`
            );

            // Display completed games if any
            const completedGames = stats.completedGames?.[currentYear] || [];
            if (completedGames.length > 0) {
                const completionList = completedGames
                    .map(game => `${game.gameName} (${new Date(game.completionDate).toLocaleDateString()})`)
                    .join('\n');
                embed.addTerminalField(`${currentYear} COMPLETIONS`, completionList);
            }

            // Add monthly achievements if any
            const recentAchievements = stats.monthlyAchievements[currentYear] || {};
            if (Object.keys(recentAchievements).length > 0) {
                const achievementText = Object.entries(recentAchievements)
                    .map(([month, achievement]) =>
                        `${month}: ${achievement.place} place (${achievement.points} pts)`)
                    .join('\n');
                embed.addTerminalField('MONTHLY ACHIEVEMENTS', achievementText);
            }

            // Add bonus points if any
            const recentBonusPoints = (stats.bonusPoints || [])
                .filter(bonus => bonus.year === currentYear)
                .map(bonus => `${bonus.points} pts - ${bonus.reason}`)
                .join('\n');

            if (recentBonusPoints) {
                embed.addTerminalField('BONUS POINTS', recentBonusPoints);
            }

            embed.setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    }
};

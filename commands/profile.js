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

            // Fetch all required data
            const [data, yearlyLeaderboard, stats, currentChallenge] = await Promise.all([
                fetchLeaderboardData(), // Monthly leaderboard data
                userStats.getYearlyLeaderboard(), // Yearly leaderboard
                userStats.getUserStats(username), // User-specific stats
                database.getCurrentChallenge() // Current challenge details
            ]);

            const yearlyPoints = stats.yearlyPoints?.[currentYear] || 0;

            // Determine yearly and monthly ranks
            const yearlyRank = yearlyLeaderboard.findIndex(user =>
                user.username.toLowerCase() === username.toLowerCase()
            ) + 1;

            const monthlyRank = data.leaderboard.findIndex(user =>
                user.username.toLowerCase() === username.toLowerCase()
            ) + 1;

            // Extract user leaderboard details
            const userLeaderboardData = data.leaderboard.find(user =>
                user.username.toLowerCase() === username.toLowerCase()
            );

            const profileIcon = userLeaderboardData?.profileImage || `https://retroachievements.org/Images/UserPic/${username}.png`;

            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .setThumbnail(profileIcon);

            if (userLeaderboardData) {
                embed.addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge.gameName}\n` +
                    `PROGRESS: ${userLeaderboardData.completionPercentage}%\n` +
                    `ACHIEVEMENTS: ${userLeaderboardData.completedAchievements}/${userLeaderboardData.totalAchievements}`
                );
            }

            embed.addTerminalField(`${currentYear} STATISTICS`,
                `YEARLY POINTS: ${yearlyPoints}\n` +
                `YEARLY RANK: ${yearlyRank || 'N/A'}/${yearlyLeaderboard.length}\n` +
                `MONTHLY RANK: ${monthlyRank || 'N/A'}/${data.leaderboard.length}\n` +
                `GAMES COMPLETED: ${stats.yearlyStats?.[currentYear]?.totalGamesCompleted || 0}\n` +
                `ACHIEVEMENTS UNLOCKED: ${stats.yearlyStats?.[currentYear]?.totalAchievementsUnlocked || 0}\n` +
                `HARDCORE COMPLETIONS: ${stats.yearlyStats?.[currentYear]?.hardcoreCompletions || 0}\n` +
                `MONTHLY PARTICIPATIONS: ${stats.yearlyStats?.[currentYear]?.monthlyParticipations || 0}`
            );

            const completedGames = stats.completedGames?.[currentYear] || [];
            if (completedGames.length > 0) {
                embed.addTerminalField(`${currentYear} COMPLETIONS`,
                    completedGames.map(game =>
                        `${game.gameName} (${new Date(game.completionDate).toLocaleDateString()})`
                    ).join('\n')
                );
            }

            const monthlyAchievements = stats.monthlyAchievements?.[currentYear] || {};
            if (Object.keys(monthlyAchievements).length > 0) {
                embed.addTerminalField('MONTHLY ACHIEVEMENTS',
                    Object.entries(monthlyAchievements).map(([month, achievement]) =>
                        `${month}: ${achievement.place} place (${achievement.points} pts)`
                    ).join('\n')
                );
            }

            const bonusPoints = (stats.bonusPoints || [])
                .filter(bonus => bonus.year === currentYear)
                .map(bonus => `${bonus.points} pts - ${bonus.reason}`)
                .join('\n');
            if (bonusPoints) {
                embed.addTerminalField('BONUS POINTS', bonusPoints);
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

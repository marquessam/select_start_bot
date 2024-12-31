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

            // Initial message to the user
            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            const currentYear = new Date().getFullYear().toString();

            // Add detailed logs and fallback handling for data fetching
            console.log('Fetching data for !profile command...');
            
            const [data, yearlyLeaderboard, stats, currentChallenge] = await Promise.all([
                (async () => {
                    try {
                        console.log('Fetching leaderboard data...');
                        const leaderboardData = await fetchLeaderboardData();
                        console.log('Leaderboard data fetched successfully.');
                        return leaderboardData;
                    } catch (error) {
                        console.error('Error fetching leaderboard data:', error);
                        return { leaderboard: [] }; // Fallback structure
                    }
                })(),
                (async () => {
                    try {
                        console.log('Fetching yearly leaderboard...');
                        const leaderboard = await userStats.getYearlyLeaderboard();
                        console.log('Yearly leaderboard fetched successfully.');
                        return leaderboard;
                    } catch (error) {
                        console.error('Error fetching yearly leaderboard:', error);
                        return []; // Fallback structure
                    }
                })(),
                (async () => {
                    try {
                        console.log('Fetching user stats...');
                        const userStatsData = await userStats.getUserStats(username);
                        console.log('User stats fetched successfully.');
                        return userStatsData;
                    } catch (error) {
                        console.error('Error fetching user stats:', error);
                        return {
                            yearlyPoints: {},
                            yearlyStats: {},
                            completedGames: {},
                            monthlyAchievements: {},
                            bonusPoints: []
                        }; // Fallback structure
                    }
                })(),
                (async () => {
                    try {
                        console.log('Fetching current challenge...');
                        const challenge = await database.getCurrentChallenge();
                        console.log('Current challenge fetched successfully.');
                        return challenge;
                    } catch (error) {
                        console.error('Error fetching current challenge:', error);
                        return { gameName: 'Unknown' }; // Fallback structure
                    }
                })()
            ]);

            console.log('All data fetched:', { data, yearlyLeaderboard, stats, currentChallenge });

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

            // Add challenge progress if available
            if (userLeaderboardData) {
                embed.addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge.gameName}\n` +
                    `PROGRESS: ${userLeaderboardData.completionPercentage}%\n` +
                    `ACHIEVEMENTS: ${userLeaderboardData.completedAchievements}/${userLeaderboardData.totalAchievements}`
                );
            }

            // Add yearly statistics
            embed.addTerminalField(`${currentYear} STATISTICS`,
                `YEARLY POINTS: ${yearlyPoints}\n` +
                `YEARLY RANK: ${yearlyRank || 'N/A'}/${yearlyLeaderboard.length}\n` +
                `MONTHLY RANK: ${monthlyRank || 'N/A'}/${data.leaderboard.length}\n` +
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
            const recentAchievements = stats.monthlyAchievements?.[currentYear] || {};
            if (Object.keys(recentAchievements).length > 0) {
                const achievementText = Object.entries(recentAchievements)
                    .map(([month, achievement]) =>
                        `${month}: ${achievement.place} place (${achievement.points} pts)`)
                    .join('\n');
                embed.addTerminalField('MONTHLY ACHIEVEMENTS', achievementText);
            }

            // Add bonus points if any
            const bonusPoints = (stats.bonusPoints || [])
                .filter(bonus => bonus.year === currentYear)
                .map(bonus => `${bonus.points} pts - ${bonus.reason}`)
                .join('\n');
            if (bonusPoints) {
                embed.addTerminalField('BONUS POINTS', bonusPoints);
            }

            embed.setTerminalFooter();

            // Send the profile embed
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Profile Command Error:', error.stack || error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    }
};

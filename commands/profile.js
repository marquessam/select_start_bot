const TerminalEmbed = require('../utils/embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');

module.exports = {
    name: 'profile',
    description: 'Displays user profile and stats',
    async execute(message, args, { userStats }) {
        try {
            const username = args[0];
            if (!username) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Get valid users and yearly leaderboard
            const validUsers = await userStats.getAllUsers();
            if (!validUsers.includes(username.toLowerCase())) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] User not found in participant list\n[Ready for input]█\x1b[0m```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            try {
                // Get user stats, leaderboard, and RA data
                const [stats, leaderboard, raData] = await Promise.all([
                    userStats.getUserStats(username),
                    userStats.getYearlyLeaderboard(),
                    fetchLeaderboardData()
                ]);

                // Get RA user progress
                const userProgress = raData.leaderboard.find(user => 
                    user.username.toLowerCase() === username.toLowerCase()
                );

                // Find user's points and calculate rank
                const userPoints = leaderboard.find(user => 
                    user.username.toLowerCase() === username.toLowerCase()
                )?.points || 0;

                // Calculate rank considering ties
                let userRank = 1;
                const higherScores = new Set(
                    leaderboard
                        .filter(user => user.points > userPoints)
                        .map(user => user.points)
                );
                userRank = higherScores.size + 1;

                const currentYear = new Date().getFullYear().toString();
                const yearlyPoints = stats.yearlyPoints[currentYear] || 0;
                const recentAchievements = stats.monthlyAchievements[currentYear] || {};
                
                const recentAchievementsText = Object.entries(recentAchievements)
                    .map(([month, achievement]) => 
                        `${month}: ${achievement.place} place (${achievement.points} pts)`)
                    .join('\n');

                const recentBonusPoints = stats.bonusPoints
                    .filter(bonus => bonus.year === currentYear)
                    .map(bonus => `${bonus.points} pts - ${bonus.reason}`)
                    .join('\n');

                const embed = new TerminalEmbed()
                    .setTerminalTitle(`USER DATA: ${username}`);

                // Add RA specific data if available
                if (userProgress) {
                    embed.setURL(userProgress.profileUrl)
                        .setThumbnail(userProgress.profileImage)
                        .addTerminalField('CURRENT MISSION PROGRESS', 
                            `ACHIEVEMENTS: ${userProgress.completedAchievements}/${userProgress.totalAchievements}\nCOMPLETION: ${userProgress.completionPercentage}%`);
                }

                embed.setTerminalDescription('[STATUS: AUTHENTICATED]\n[CLEARANCE: GRANTED]')
                    .addTerminalField('YEARLY STATISTICS',
                        `TOTAL POINTS: ${yearlyPoints}\nRANK: ${userRank}/${leaderboard.length}`);

                if (recentAchievementsText) {
                    embed.addTerminalField('MONTHLY ACHIEVEMENTS', recentAchievementsText);
                }

                if (recentBonusPoints) {
                    embed.addTerminalField('POINTS EARNED', recentBonusPoints);
                }

                embed.setTerminalFooter();
                await message.channel.send({ embeds: [embed] });
                await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');

            } catch (fetchError) {
                console.error('Error fetching data:', fetchError);
                throw new Error('Failed to fetch user data');
            }
        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Database connection failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

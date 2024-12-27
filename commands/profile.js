const TerminalEmbed = require('../utils/embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');

module.exports = {
    name: 'profile',
    description: 'Displays user profile and stats',
    async execute(message, args, { userStats }) {
        try {
            console.log('Starting profile command for args:', args);
            const username = args[0];

            if (!username) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');
            console.log('Fetching leaderboard data for:', username);

            try {
                const data = await fetchLeaderboardData();
                console.log('Leaderboard data fetched:', data ? 'success' : 'null');
                
                const userProgress = data.leaderboard.find(user => 
                    user.username.toLowerCase() === username.toLowerCase()
                );
                console.log('User progress found:', userProgress ? 'yes' : 'no');

                const stats = await userStats.getUserStats(username);
                console.log('User stats fetched:', stats ? 'success' : 'null');
                
                if (!userProgress) {
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] User not found in database\n[Ready for input]█\x1b[0m```');
                    return;
                }

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
                    .setTerminalTitle(`USER DATA: ${userProgress.username}`)
                    .setURL(userProgress.profileUrl)
                    .setThumbnail(userProgress.profileImage)
                    .setTerminalDescription('[STATUS: AUTHENTICATED]\n[CLEARANCE: GRANTED]')
                    .addTerminalField('CURRENT MISSION PROGRESS', 
                        `ACHIEVEMENTS: ${userProgress.completedAchievements}/${userProgress.totalAchievements}\nCOMPLETION: ${userProgress.completionPercentage}%`)
                    .addTerminalField('YEARLY STATISTICS',
                        `TOTAL POINTS: ${yearlyPoints}\nRANK: Coming soon...`);

                if (recentAchievementsText) {
                    embed.addTerminalField('MONTHLY ACHIEVEMENTS', recentAchievementsText);
                }

                if (recentBonusPoints) {
                    embed.addTerminalField('BONUS POINTS', recentBonusPoints);
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

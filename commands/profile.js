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

            // Get all necessary data
            const [data, yearlyLeaderboard, stats, currentChallenge] = await Promise.all([
                fetchLeaderboardData(), // Fetches current monthly leaderboard
                userStats.getYearlyLeaderboard(), // Fetches yearly leaderboard
                userStats.getUserStats(username), // Fetches specific user stats
                database.getCurrentChallenge() // Fetches current challenge details
            ]);

            const currentYear = new Date().getFullYear().toString();
            const yearlyPoints = stats.yearlyPoints[currentYear] || 0;

            // Calculate yearly rank
            const yearlyRank = yearlyLeaderboard.findIndex(user =>
                user.username.toLowerCase() === username.toLowerCase()
            ) + 1;

            // Calculate monthly rank
            const monthlyRank = data.leaderboard.findIndex(user =>
                user.username.toLowerCase() === username.toLowerCase()
            ) + 1;

            // Get profile icon
            const profileIcon = stats.profileIcon || `https://retroachievements.org/Images/UserPic/${username}.png`;

            // Create completion list text
            let completionList = '';
            if (stats.completedGames?.[currentYear]) {
                completionList = stats.completedGames[currentYear]
                    .map(game => `${game.gameName} (${new Date(game.completionDate).toLocaleDateString()})`)
                    .join('\n');
            }

            // Create yearly stats text
            const yearStats = stats.yearlyStats?.[currentYear] || {
                totalGamesCompleted: 0,
                totalAchievementsUnlocked: 0,
                hardcoreCompletions: 0,
                monthlyParticipations: 0
            };

            // Get current monthly progress
            const userProgress = data.leaderboard.find(user =>
                user.username.toLowerCase() === username.toLowerCase()
            );

            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .setThumbnail(profileIcon); // Add profile icon here

            if (userProgress) {
                embed.addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge.gameName}\n` +
                    `PROGRESS: ${userProgress.completionPercentage}%\n` +
                    `ACHIEVEMENTS: ${userProgress.completedAchievements}/${userProgress.totalAchievements}`
                );
            }

            embed.addTerminalField('2024 STATISTICS',
                `YEARLY POINTS: ${yearlyPoints}\n` +
                `YEARLY RANK: ${yearlyRank}/${yearlyLeaderboard.length}\n` +
                `MONTHLY RANK: ${monthlyRank}/${data.leaderboard.length}\n` +
                `GAMES COMPLETED: ${yearStats.totalGamesCompleted}\n` +
                `ACHIEVEMENTS UNLOCKED: ${yearStats.totalAchievementsUnlocked}\n` +
                `HARDCORE COMPLETIONS: ${yearStats.hardcoreCompletions}\n` +
                `MONTHLY PARTICIPATIONS: ${yearStats.monthlyParticipations}`
            );

            if (completionList) {
                embed.addTerminalField('2024 COMPLETIONS', completionList);
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
            const recentBonusPoints = stats.bonusPoints
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

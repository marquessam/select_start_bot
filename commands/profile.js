const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

// Helper function to calculate rank
function calculateRank(username, leaderboard, rankMetric) {
    // Sort the leaderboard based on the provided metric (descending)
    const sortedLeaderboard = [...leaderboard].sort((a, b) => rankMetric(b) - rankMetric(a));

    // Find the rank of the user
    let rank = 1;
    let previousValue = null;

    for (let i = 0; i < sortedLeaderboard.length; i++) {
        const currentValue = rankMetric(sortedLeaderboard[i]);

        // Update rank only if the current value is different from the previous
        if (currentValue !== previousValue) {
            rank = i + 1;
            previousValue = currentValue;
        }

        // Check if the current user matches
        if (sortedLeaderboard[i].username.toLowerCase() === username.toLowerCase()) {
            return `#${rank}`;
        }
    }

    // Return 'Unranked' if the user isn't found
    return 'Unranked';
}

module.exports = {
    name: 'profile',
    description: 'Displays enhanced user profile and stats',
    async execute(message, args) {
        try {
            const username = args[0]?.toLowerCase();
            if (!username) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Check if user is in the valid users list
            const validUsers = await DataService.getLeaderboard('monthly');
            if (!validUsers.some(user => user.username.toLowerCase() === username)) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" is not a registered participant\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            const currentYear = new Date().getFullYear().toString();

            // Fetch data from DataService
            const userStats = await DataService.getUserStats(username);
            const userProgress = await DataService.getUserProgress(username);
            const currentChallenge = await DataService.getCurrentChallenge();
            const yearlyLeaderboard = await DataService.getLeaderboard('yearly');

            // Ensure stats exist for the current year
            const yearlyData = yearlyLeaderboard.find(user => 
                user.username.toLowerCase() === username.toLowerCase()
            ) || {
                points: 0,
                gamesCompleted: 0,
                achievementsUnlocked: 0,
                monthlyParticipations: 0
            };

            // Filter bonus points for display
            const bonusPoints = userStats.bonusPoints?.filter(bonus => bonus.year === currentYear) || [];
            const recentBonusPoints = bonusPoints.length > 0 ?
                bonusPoints.map(bonus => `${bonus.reason}: ${bonus.points} pts`).join('\n') :
                'No bonus points';

            // Calculate yearly rank (based on points)
            const yearlyRankText = calculateRank(username, yearlyLeaderboard, 
                user => user.points || 0
            );

            // Calculate monthly rank (based on completion percentage)
            const monthlyRankText = calculateRank(username, validUsers, 
                user => user.completionPercentage || 0
            );

            // Create embed with updated points display
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge?.gameName || 'N/A'}\n` +
                    `PROGRESS: ${userProgress.completionPercentage}%\n` +
                    `ACHIEVEMENTS: ${userProgress.completedAchievements}/${userProgress.totalAchievements}`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRankText}\n` +
                    `YEARLY RANK: ${yearlyRankText}`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `YEARLY POINTS: ${yearlyData.points}\n` + 
                    `GAMES COMPLETED: ${yearlyData.gamesCompleted}\n` +
                    `ACHIEVEMENTS UNLOCKED: ${yearlyData.achievementsUnlocked}\n` +
                    `MONTHLY PARTICIPATIONS: ${yearlyData.monthlyParticipations}`)
                .addTerminalField('BONUS POINTS',
                    recentBonusPoints);

            if (userStats?.profileImage) {
                embed.setThumbnail(userStats.profileImage);
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

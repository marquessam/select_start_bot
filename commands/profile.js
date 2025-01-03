const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

// Helper function to calculate rank
function calculateRank(username, leaderboard, rankMetric) {
    const sortedLeaderboard = [...leaderboard].sort((a, b) => rankMetric(b) - rankMetric(a));
    let rank = 1;
    let previousValue = null;

    for (let i = 0; i < sortedLeaderboard.length; i++) {
        const currentValue = rankMetric(sortedLeaderboard[i]);
        if (currentValue !== previousValue) {
            rank = i + 1;
            previousValue = currentValue;
        }
        if (sortedLeaderboard[i].username.toLowerCase() === username.toLowerCase()) {
            return `#${rank}`;
        }
    }
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
            const raProfileImage = await DataService.getRAProfileImage(username);

            // Ensure stats exist for the current year
            const yearlyData = yearlyLeaderboard.find(user => 
                user.username.toLowerCase() === username.toLowerCase()
            ) || {
                points: 0,
                gamesCompleted: 0,
                achievementsUnlocked: 0,
                monthlyParticipations: 0,
            };

            // Filter and format bonus points
            const bonusPoints = userStats.bonusPoints?.filter(bonus => bonus.year === currentYear) || [];
            const recentBonusPoints = bonusPoints.length > 0 ?
                bonusPoints.map(bonus => `${bonus.reason}: ${bonus.points} pts`).join('\n') :
                'No bonus points';

            // Calculate yearly rank
            const yearlyRankText = calculateRank(username, yearlyLeaderboard, 
                user => user.points || 0
            );

            // Calculate monthly rank
            const monthlyRankText = calculateRank(username, validUsers, 
                user => user.completionPercentage || 0
            );

            // Create embed
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
                    `GAMES COMPLETED: ${yearlyData.gamesCompleted}\n` +
                    `ACHIEVEMENTS UNLOCKED: ${yearlyData.achievementsUnlocked || userProgress.completedAchievements || 0}\n` +
                    `MONTHLY PARTICIPATIONS: ${yearlyData.monthlyParticipations}`)
                .addTerminalField('POINT BREAKDOWN', recentBonusPoints)
                .addTerminalField('POINT TOTAL', `${yearlyData.points}`);

            // Add the profile image if available
            if (raProfileImage) {
                embed.setThumbnail(raProfileImage);
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');
            await shadowGame.tryShowError(message);
            
        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    },
};

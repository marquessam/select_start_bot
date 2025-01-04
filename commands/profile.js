const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

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

            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            // Fetch user list and check validity
            let validUsers = await DataService.getLeaderboard('monthly');
            let isUserValid = validUsers.some(user => user.username.toLowerCase() === username);

            if (!isUserValid) {
                console.log(`User "${username}" not recognized. Refreshing user list...`);
                await DataService.refreshUserList();

                // Re-fetch the updated user list
                validUsers = await DataService.getLeaderboard('monthly');
                isUserValid = validUsers.some(user => user.username.toLowerCase() === username);

                if (!isUserValid) {
                    await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" is not a registered participant\n[Ready for input]█\x1b[0m\`\`\``);
                    return;
                }
            }

            const currentYear = new Date().getFullYear().toString();

            // Fetch user data
            const userStats = await DataService.getUserStats(username);
            const userProgress = await DataService.getUserProgress(username);
            const currentChallenge = await DataService.getCurrentChallenge();
            const yearlyLeaderboard = await DataService.getLeaderboard('yearly');
            const raProfileImage = await DataService.getRAProfileImage(username);

            const yearlyData = yearlyLeaderboard.find(user => 
                user.username.toLowerCase() === username.toLowerCase()
            ) || {
                points: 0,
                gamesCompleted: 0,
                achievementsUnlocked: 0,
                monthlyParticipations: 0,
            };

            const bonusPoints = userStats.bonusPoints?.filter(bonus => bonus.year === currentYear) || [];
            const recentBonusPoints = bonusPoints.length > 0 ?
                bonusPoints.map(bonus => `${bonus.reason}: ${bonus.points} pts`).join('\n') :
                'No bonus points';

            const yearlyRankText = calculateRank(username, yearlyLeaderboard, 
                user => user.points || 0
            );

            const monthlyRankText = calculateRank(username, validUsers, 
                user => user.completionPercentage || 0
            );

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

const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

function calculateRank(username, leaderboard, rankMetric) {
    const user = leaderboard.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || rankMetric(user) === 0) {
        return 'No Rank';
    }

    const sortedLeaderboard = [...leaderboard]
        .filter(u => rankMetric(u) > 0)
        .sort((a, b) => rankMetric(b) - rankMetric(a));

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

    return 'No Rank';
}

async function getInitialUserData(username, userStats) {
    const cleanUsername = username.toLowerCase();
    const validUsers = await DataService.getValidUsers();
    
    if (!validUsers.includes(cleanUsername)) {
        return null;
    }

    if (userStats) {
        await userStats.initializeUserIfNeeded(cleanUsername);
    }

    return cleanUsername;
}

module.exports = {
    name: 'profile',
    description: 'Displays enhanced user profile and stats',
    
    async execute(message, args, { shadowGame, userStats }) {
        try {
            if (!args.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const username = args[0];
            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            const validatedUser = await getInitialUserData(username, userStats);
            if (!validatedUser) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" is not a registered participant\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            const [
                userStatsData,
                userProgress,
                currentChallenge,
                yearlyLeaderboard,
                raProfileImage,
                validUsers,
                monthlyLeaderboard
            ] = await Promise.all([
                DataService.getUserStats(validatedUser),
                DataService.getUserProgress(validatedUser),
                DataService.getCurrentChallenge(),
                DataService.getLeaderboard('yearly'),
                DataService.getRAProfileImage(validatedUser),
                DataService.getValidUsers(),
                DataService.getLeaderboard('monthly')
            ]);

            const currentYear = new Date().getFullYear().toString();

            const yearlyData = yearlyLeaderboard.find(user => 
                user.username.toLowerCase() === validatedUser
            ) || {
                points: 0,
                gamesBeaten: 0,
                achievementsUnlocked: 0,
                monthlyParticipations: 0
            };

            const bonusPoints = userStatsData?.bonusPoints?.filter(bonus => 
                bonus.year === currentYear
            ) || [];

            const recentBonusPoints = bonusPoints.length > 0 
                ? bonusPoints.map(bonus => `${bonus.reason}: ${bonus.points} pts`).join('\n')
                : 'No bonus points';

            const yearlyRankText = calculateRank(validatedUser, yearlyLeaderboard, 
                user => user.points || 0
            );

            const monthlyRankText = calculateRank(validatedUser, monthlyLeaderboard,
                user => user.completionPercentage || 0
            );

            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge?.gameName || 'N/A'}\n` +
                    `PROGRESS: ${userProgress.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${userProgress.completedAchievements || 0}/${userProgress.totalAchievements || 0}`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRankText}\n` +
                    `YEARLY RANK: ${yearlyRankText}`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `GAMES BEATEN: ${yearlyData.gamesBeaten || 0}\n` +
                    `ACHIEVEMENTS UNLOCKED: ${yearlyData.achievementsUnlocked || userProgress.completedAchievements || 0}\n` +
                    `MONTHLY PARTICIPATIONS: ${yearlyData.monthlyParticipations || 0}`)
                .addTerminalField('POINT BREAKDOWN', recentBonusPoints)
                .addTerminalField('POINT TOTAL', `${yearlyData.points || 0}`);

            if (raProfileImage) {
                embed.setThumbnail(raProfileImage);
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');
            
            if (shadowGame) {
                await shadowGame.tryShowError(message);
            }

        } catch (error) {
            console.error('[PROFILE] Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    },
};

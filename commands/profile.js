// profile.js
const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

module.exports = {
    name: 'profile',
    description: 'Displays user profile and stats',

    async execute(message, args, { shadowGame, userStats, pointsManager }) {
        try {
            if (!args.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const username = args[0].toLowerCase();
            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            // Validate user
            const validUsers = await DataService.getValidUsers();
            if (!validUsers.includes(username)) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" is not a registered participant\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            // Fetch all necessary data concurrently
            const [
                userStatsData,
                userProgress,
                currentChallenge,
                yearlyLeaderboard,
                monthlyLeaderboard,
                raProfileImage
            ] = await Promise.all([
                DataService.getUserStats(username),
                DataService.getUserProgress(username),
                DataService.getCurrentChallenge(),
                DataService.getLeaderboard('yearly'),
                DataService.getLeaderboard('monthly'),
                DataService.getRAProfileImage(username)
            ]);

            const currentYear = new Date().getFullYear().toString();

            // Get user points for the year
            const yearlyPoints = await pointsManager.getUserPoints(username, currentYear);
            const totalYearlyPoints = yearlyPoints.reduce((sum, bp) => sum + bp.points, 0);

            // Calculate user rankings efficiently
            const yearlyRank = calculateRank(username, yearlyLeaderboard, u => u.points);
            const monthlyRank = calculateRank(username, monthlyLeaderboard, u => parseFloat(u.completionPercentage));

            // Generate yearly statistics
            const yearlyStats = calculateYearlyStats(yearlyPoints, userStatsData);

            // Prepare embed message
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username.toUpperCase()}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge?.gameName || 'N/A'}\n` +
                    `PROGRESS: ${userProgress?.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${userProgress?.completedAchievements || 0}/${userProgress?.totalAchievements || 0}`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRank}\n` +
                    `YEARLY RANK: ${yearlyRank}`)
                .addTerminalField('SACRED SCROLL',
                    `\x1b[33m[W1X4BY] Ancient writing appears here...\x1b[0m`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `ACHIEVEMENTS EARNED: ${yearlyStats.achievementsUnlocked}\n` +
                    `GAMES PARTICIPATED: ${yearlyStats.participations}\n` +
                    `GAMES BEATEN: ${yearlyStats.gamesBeaten}\n` +
                    `GAMES MASTERED: ${yearlyStats.gamesMastered}`)
                .addTerminalField('POINT TOTAL', `${totalYearlyPoints} points`);

            if (raProfileImage) {
                embed.setThumbnail(raProfileImage);
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');

            if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);

        } catch (error) {
            console.error('[PROFILE] Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    }
};

function calculateRank(username, leaderboard, rankMetric) {
    const user = leaderboard.find(u => u.username.toLowerCase() === username);
    if (!user || rankMetric(user) === 0) return 'No Rank';

    const sortedLeaderboard = leaderboard
        .filter(u => rankMetric(u) > 0)
        .sort((a, b) => rankMetric(b) - rankMetric(a));

    let rank = 1, previousValue = null;
    for (let i = 0; i < sortedLeaderboard.length; i++) {
        const currentValue = rankMetric(sortedLeaderboard[i]);
        if (currentValue !== previousValue) {
            rank = i + 1;
            previousValue = currentValue;
        }
        if (sortedLeaderboard[i].username.toLowerCase() === username) {
            return `#${rank}`;
        }
    }
    return 'No Rank';
}

function calculateYearlyStats(points, userStats) {
    const uniquePoints = new Map();

    points.forEach(point => {
        const key = point.internalReason || point.reason;
        if (!uniquePoints.has(key) || new Date(point.date) > new Date(uniquePoints.get(key).date)) {
            uniquePoints.set(key, point);
        }
    });

    const uniquePointsArray = Array.from(uniquePoints.values());

    return {
        participations: uniquePointsArray.filter(p => p.reason.includes('Participation')).length,
        gamesBeaten: uniquePointsArray.filter(p => p.reason.includes('Beaten')).length,
        gamesMastered: uniquePointsArray.filter(p => p.reason.includes('Mastery')).length,
        achievementsUnlocked: userStats?.yearlyStats?.[new Date().getFullYear()]?.totalAchievementsUnlocked || 0
    };
}

module.exports = module.exports;

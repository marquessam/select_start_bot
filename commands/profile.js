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

            const username = args[0];
            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            // Validate user
            const validUsers = await DataService.getValidUsers();
            if (!validUsers.includes(username.toLowerCase())) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" is not a registered participant\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            // Fetch all necessary data
            const [
                userStatsData,
                userProgress,
                currentChallenge,
                yearlyLeaderboard,
                raProfileImage,
                monthlyLeaderboard,
                bonusPoints
            ] = await Promise.all([
                DataService.getUserStats(username),
                DataService.getUserProgress(username),
                DataService.getCurrentChallenge(),
                DataService.getLeaderboard('yearly'),
                DataService.getRAProfileImage(username),
                DataService.getLeaderboard('monthly'),
                pointsManager.getUserPoints(username)
            ]);

            const currentYear = new Date().getFullYear().toString();

            // Process bonus points
            const yearlyPoints = bonusPoints.filter(bp => bp.year === currentYear);
            const pointsBreakdown = organizePointsBreakdown(yearlyPoints);
            const totalYearlyPoints = yearlyPoints.reduce((sum, bp) => sum + bp.points, 0);

            // Calculate ranks
            const yearlyRank = calculateRank(username, yearlyLeaderboard, u => u.points);
            const monthlyRank = calculateRank(username, monthlyLeaderboard, u => parseFloat(u.completionPercentage));

            // Calculate stats
            const yearlyStats = calculateYearlyStats(yearlyPoints);

            // Create embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge?.gameName || 'N/A'}\n` +
                    `PROGRESS: ${userProgress.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${userProgress.completedAchievements || 0}/${userProgress.totalAchievements || 0}`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRank}\n` +
                    `YEARLY RANK: ${yearlyRank}`)
                .addTerminalField('SACRED SCROLL',
                    `\x1b[33m[W1X4BY] Ancient writing appears here...\x1b[0m`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `ACHIEVEMENTS EARNED: ${yearlyStats.achievementsUnlocked}\n` +
                    `GAMES PARTICIPATED: ${yearlyStats.participations}\n` +
                    `GAMES BEATEN: ${yearlyStats.gamesBeaten}\n` +
                    `GAMES MASTERED: ${yearlyStats.gamesMastered}`);

            if (pointsBreakdown) {
                embed.addTerminalField('POINT BREAKDOWN', pointsBreakdown);
            }

            embed.addTerminalField('POINT TOTAL', `${totalYearlyPoints} points`);

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

function organizePointsBreakdown(points) {
    const categories = {
        'Participations': [],
        'Games Beaten': [],
        'Games Mastered': [],
        'Other': []
    };

    points.forEach(point => {
        const reason = point.reason;
        if (reason.includes('Participation')) {
            categories['Participations'].push(`${reason}: ${point.points} pts`);
        } else if (reason.includes('Beaten')) {
            categories['Games Beaten'].push(`${reason}: ${point.points} pts`);
        } else if (reason.includes('Mastery')) {
            categories['Games Mastered'].push(`${reason}: ${point.points} pts`);
        } else {
            categories['Other'].push(`${reason}: ${point.points} pts`);
        }
    });

    return Object.entries(categories)
        .filter(([_, points]) => points.length > 0)
        .map(([category, points]) => `${category}:\n${points.join('\n')}`)
        .join('\n\n');
}

function calculateYearlyStats(points) {
    return {
        participations: points.filter(p => p.reason.includes('Participation')).length,
        gamesBeaten: points.filter(p => p.reason.includes('Beaten')).length,
        gamesMastered: points.filter(p => p.reason.includes('Mastery')).length,
        achievementsUnlocked: points.length // This should be updated with actual achievement count
    };
}

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

            // Clean up any duplicate points before fetching
            await pointsManager.cleanupDuplicatePoints(username);

            // Fetch all necessary data
            const [
                userStatsData,
                userProgress,
                currentChallenge,
                yearlyLeaderboard,
                raProfileImage,
                monthlyLeaderboard
            ] = await Promise.all([
                DataService.getUserStats(username),
                DataService.getUserProgress(username),
                DataService.getCurrentChallenge(),
                DataService.getLeaderboard('yearly'),
                DataService.getRAProfileImage(username),
                DataService.getLeaderboard('monthly')
            ]);

            const currentYear = new Date().getFullYear().toString();

            // Get deduplicated points for the year
            const yearlyPoints = await pointsManager.getUserPoints(username, currentYear);
            
            // Calculate user stats and rankings
            const totalYearlyPoints = yearlyPoints.reduce((sum, bp) => sum + bp.points, 0);
            const yearlyRank = calculateRank(username, yearlyLeaderboard, u => u.points);
            const monthlyRank = calculateRank(username, monthlyLeaderboard, u => parseFloat(u.completionPercentage));
            const yearlyStats = calculateYearlyStats(yearlyPoints, userStatsData);

            // Organize points for display
            const pointsBreakdown = organizePointsBreakdown(
                yearlyPoints.filter(p => !p.hidden) // Filter out any hidden points
            );

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
    // Create a map to track unique point reasons
    const uniquePoints = new Map();
    
    // Group points by their reason, keeping only the most recent one
    points.forEach(point => {
        const key = point.internalReason || point.reason;
        if (!uniquePoints.has(key) || new Date(point.date) > new Date(uniquePoints.get(key).date)) {
            uniquePoints.set(key, point);
        }
    });

    const categories = {
        'Participations': [],
        'Games Beaten': [],
        'Games Mastered': [],
        'Other': []
    };

    // Use only unique points for the breakdown
    uniquePoints.forEach(point => {
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

function calculateYearlyStats(points, userStats) {
    // Create a map to track unique point types
    const uniquePoints = new Map();
    
    // Track only unique instances of each point type
    points.forEach(point => {
        const key = point.internalReason || point.reason;
        if (!uniquePoints.has(key) || new Date(point.date) > new Date(uniquePoints.get(key).date)) {
            uniquePoints.set(key, point);
        }
    });

    // Convert back to array for filtering
    const uniquePointsArray = Array.from(uniquePoints.values());

    return {
        participations: uniquePointsArray.filter(p => p.reason.includes('Participation')).length,
        gamesBeaten: uniquePointsArray.filter(p => p.reason.includes('Beaten')).length,
        gamesMastered: uniquePointsArray.filter(p => p.reason.includes('Mastery')).length,
        achievementsUnlocked: userStats?.yearlyStats?.[new Date().getFullYear()]?.totalAchievementsUnlocked || 0
    };
}

module.exports = module.exports;

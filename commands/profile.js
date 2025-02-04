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
                yearlyPoints,
                raProfileImage
            ] = await Promise.all([
                DataService.getUserStats(username),
                DataService.getUserProgress(username),
                DataService.getCurrentChallenge(),
                DataService.getLeaderboard('yearly'),
                DataService.getLeaderboard('monthly'),
                pointsManager.getUserPoints(username, new Date().getFullYear().toString()),
                DataService.getRAProfileImage(username)
            ]);

            const currentYear = new Date().getFullYear().toString();
            const totalYearlyPoints = yearlyPoints.reduce((sum, bp) => sum + bp.points, 0);

            // Calculate user rankings
            const yearlyRank = this.calculateRank(username, yearlyLeaderboard, u => u.points);
            const monthlyRank = this.calculateRank(username, monthlyLeaderboard, u => parseFloat(u.completionPercentage));

            // Prepare points breakdown
            const pointsBreakdown = await this.formatPointsBreakdown(yearlyPoints);

            // Generate yearly statistics
            const yearlyStats = this.calculateYearlyStats(yearlyPoints, userStatsData);

            // Create embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username.toUpperCase()}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: "${currentChallenge?.gameName || 'N/A'}"\n` +
                    `PROGRESS: ${userProgress?.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${userProgress?.completedAchievements || 0}/${userProgress?.totalAchievements || 0}\n` +
                    (userProgress?.hasBeatenGame ? '✅ Game Completed' : '⏳ In Progress')
                );

            // Add rankings with medals if applicable
            const medals = { '1': '🥇', '2': '🥈', '3': '🥉' };
            const monthlyRankDisplay = monthlyRank.startsWith('#') ? 
                `${medals[monthlyRank.slice(1)] || ''} ${monthlyRank}` : monthlyRank;
            const yearlyRankDisplay = yearlyRank.startsWith('#') ? 
                `${medals[yearlyRank.slice(1)] || ''} ${yearlyRank}` : yearlyRank;

            embed.addTerminalField('RANKINGS',
                `MONTHLY RANK: ${monthlyRankDisplay}\n` +
                `YEARLY RANK: ${yearlyRankDisplay}\n` +
                `TOTAL ${currentYear} POINTS: ${totalYearlyPoints}`
            );

            // Add yearly statistics
            embed.addTerminalField(`${currentYear} STATISTICS`,
                `ACHIEVEMENTS EARNED: ${yearlyStats.achievementsUnlocked}\n` +
                `GAMES PARTICIPATED: ${yearlyStats.participations}\n` +
                `GAMES BEATEN: ${yearlyStats.gamesBeaten}\n` +
                `GAMES MASTERED: ${yearlyStats.gamesMastered}`
            );

            // Add points breakdown sections
            if (pointsBreakdown.participations.length > 0) {
                embed.addTerminalField('PARTICIPATIONS', pointsBreakdown.participations.join('\n'));
            }

            if (pointsBreakdown.gamesBeaten.length > 0) {
                embed.addTerminalField('GAMES BEATEN', pointsBreakdown.gamesBeaten.join('\n'));
            }

            if (pointsBreakdown.gamesMastered.length > 0) {
                embed.addTerminalField('GAMES MASTERED', pointsBreakdown.gamesMastered.join('\n'));
            }

            // Add total points at the bottom
            embed.addTerminalField('TOTAL POINTS', `${totalYearlyPoints} points`);

            // Set profile image
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
    },

    calculateRank(username, leaderboard, rankMetric) {
        const user = leaderboard.find(u => u.username.toLowerCase() === username.toLowerCase());
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
            if (sortedLeaderboard[i].username.toLowerCase() === username.toLowerCase()) {
                return `#${rank}`;
            }
        }
        return 'No Rank';
    },

async formatPointsBreakdown(points) {
    // Create a Map to track unique game-type combinations
    const uniquePoints = new Map();

    for (const point of points) {
        // Split reason into game name and type
        let [gameName, type] = (point.reason.display || point.reason).split(' - ');
        
        // Shorten common game names
        gameName = gameName
            .replace('The Legend of Zelda: ', '')
            .replace('Legend of Zelda: ', '')
            .trim();

        const key = `${gameName}-${type}-${point.gameId}`;
        
        // Only store the first occurrence of each unique game-type combination
        if (!uniquePoints.has(key)) {
            uniquePoints.set(key, {
                gameName,
                type,
                points: point.points,
                gameId: point.gameId
            });
        }
    }

    // Sort points into categories
    const categories = {
        monthlyGames: [],
        shadowGames: [],
        mastery: []
    };

    // Get current month's games for special highlighting
    const currentGames = new PointsSystem(this.database).getCurrentMonthGames();
    
    for (const point of uniquePoints.values()) {
        const isCurrentMonthly = currentGames?.monthlyGame.id === point.gameId;
        const isCurrentShadow = currentGames?.shadowGame.id === point.gameId;
        const isMastery = point.type.toLowerCase().includes('mastery');

        const display = `${point.gameName} - ${point.points} point${point.points !== 1 ? 's' : ''}`;
        
        if (isMastery) {
            categories.mastery.push(`${display} 🏆`);
        } else if (isCurrentShadow || point.gameId === currentGames?.shadowGame.id) {
            categories.shadowGames.push(`${display}${isCurrentShadow ? ' 🌘' : ''}`);
        } else {
            categories.monthlyGames.push(`${display}${isCurrentMonthly ? ' ⭐' : ''}`);
        }
    }

    // Sort categories
    categories.monthlyGames.sort();
    categories.shadowGames.sort();
    categories.mastery.sort();

    return categories;
}

// Updated section of execute function that displays points
// Add this after the rankings field:

if (yearlyPoints.length > 0) {
    const pointsBreakdown = await this.formatPointsBreakdown(yearlyPoints);

    if (pointsBreakdown.monthlyGames.length > 0) {
        embed.addTerminalField('MONTHLY CHALLENGES',
            pointsBreakdown.monthlyGames.join('\n'));
    }

    if (pointsBreakdown.shadowGames.length > 0) {
        embed.addTerminalField('SHADOW GAMES',
            pointsBreakdown.shadowGames.join('\n'));
    }

    if (pointsBreakdown.mastery.length > 0) {
        embed.addTerminalField('MASTERIES',
            pointsBreakdown.mastery.join('\n'));
    }
}

// Add totals and statistics
const pointStats = yearlyPoints.reduce((acc, p) => {
    acc.total += p.points;
    if (p.reason.toLowerCase().includes('participation')) acc.participations++;
    if (p.reason.toLowerCase().includes('beaten')) acc.gamesBeaten++;
    if (p.reason.toLowerCase().includes('mastery')) acc.gamesMastered++;
    return acc;
}, { total: 0, participations: 0, gamesBeaten: 0, gamesMastered: 0 });

embed.addTerminalField('STATISTICS',
    `Total Points: ${pointStats.total}\n` +
    `Games Participated: ${pointStats.participations}\n` +
    `Games Beaten: ${pointStats.gamesBeaten}\n` +
    `Games Mastered: ${pointStats.gamesMastered}`
);

    calculateYearlyStats(points, userStats) {
        const currentYear = new Date().getFullYear().toString();
        const yearStats = {
            participations: 0,
            gamesBeaten: 0,
            gamesMastered: 0,
            achievementsUnlocked: userStats?.yearlyStats?.[currentYear]?.totalAchievementsUnlocked || 0
        };

        // Create a Set to track unique games
        const uniqueGames = new Set();

        // Process each point entry
        for (const point of points) {
            const reasonLower = point.reason.toLowerCase();
            
            // Extract game name from reason (assuming format "Game Name - Action")
            const gameName = point.reason.split('-')[0].trim();
            
            if (reasonLower.includes('participation')) {
                uniqueGames.add(gameName);
                yearStats.participations++;
            }
            if (reasonLower.includes('beaten')) {
                yearStats.gamesBeaten++;
            }
            if (reasonLower.includes('mastery')) {
                yearStats.gamesMastered++;
            }
        }

        return yearStats;
    }
};

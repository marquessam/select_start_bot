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
                raProfileImage,
                yearlyPoints
            ] = await Promise.all([
                DataService.getUserStats(username),
                DataService.getUserProgress(username),
                DataService.getCurrentChallenge(),
                DataService.getLeaderboard('yearly'),
                DataService.getLeaderboard('monthly'),
                DataService.getRAProfileImage(username),
                pointsManager.getUserPoints(username, new Date().getFullYear().toString())
            ]);

            const currentYear = new Date().getFullYear().toString();
            const totalYearlyPoints = yearlyPoints.reduce((sum, bp) => sum + bp.points, 0);

            // Calculate user rankings
            const yearlyRank = module.exports.calculateRank(username, yearlyLeaderboard, u => u.points);
            const monthlyRank = module.exports.calculateRank(username, monthlyLeaderboard, u => parseFloat(u.completionPercentage));

            // Prepare points breakdown
            const pointsBreakdown = await module.exports.formatPointsBreakdown(yearlyPoints);

            // Generate yearly statistics
            const yearlyStats = module.exports.calculateYearlyStats(yearlyPoints, userStatsData);

            // Create embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username.toUpperCase()}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge?.gameName || 'N/A'}\n` +
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

            // Add points breakdown
            if (pointsBreakdown.Participations.length > 0) {
                embed.addTerminalField('PARTICIPATIONS', pointsBreakdown.Participations.join('\n'));
            }
            if (pointsBreakdown['Games Beaten'].length > 0) {
                embed.addTerminalField('GAMES BEATEN', pointsBreakdown['Games Beaten'].join('\n'));
            }
            if (pointsBreakdown['Games Mastered'].length > 0) {
                embed.addTerminalField('GAMES MASTERED', pointsBreakdown['Games Mastered'].join('\n'));
            }

            embed.addTerminalField('TOTAL POINTS', `${totalYearlyPoints} points`);

            // Add profile image if available
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
        const categories = {
            'Participations': [],
            'Games Beaten': [],
            'Games Mastered': []
        };

        // Process each point entry
        for (const point of points) {
            const gameName = point.reason.split('-')[0].trim();

            if (point.reason.toLowerCase().includes('participation')) {
                categories['Participations'].push(`${gameName} - ${point.points} point${point.points > 1 ? 's' : ''}`);
            } else if (point.reason.toLowerCase().includes('beaten')) {
                categories['Games Beaten'].push(`${gameName} - ${point.points} point${point.points > 1 ? 's' : ''}`);
            } else if (point.reason.toLowerCase().includes('mastery')) {
                categories['Games Mastered'].push(`${gameName} - ${point.points} point${point.points > 1 ? 's' : ''}`);
            }
        }
        return categories;
    }
},

function calculateYearlyStats(points, userStats) {
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
        if (reasonLower.includes('beaten') || reasonLower.includes('completion')) {
            yearStats.gamesBeaten++;
        }
        if (reasonLower.includes('mastery')) {
            yearStats.gamesMastered++;
        }
    }

    return yearStats;
}

module.exports = module.exports;

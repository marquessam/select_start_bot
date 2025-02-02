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
            const yearlyRank = calculateRank(username, yearlyLeaderboard, u => u.points);
            const monthlyRank = calculateRank(username, monthlyLeaderboard, u => parseFloat(u.completionPercentage));

            // Prepare points breakdown
            const pointsBreakdown = await formatPointsBreakdown(yearlyPoints);

            // Generate yearly statistics
            const yearlyStats = calculateYearlyStats(yearlyPoints, userStatsData);

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

            // Add points breakdown with sections
            const breakdownSections = pointsBreakdown.sections;
            if (pointsBreakdown.sections.monthlyChallenge.trim() !== 'No monthly challenge points') {
                embed.addTerminalField('MONTHLY CHALLENGE POINTS', pointsBreakdown.sections.monthlyChallenge);
            }
            if (pointsBreakdown.sections.shadowGame.trim() !== 'No shadow game points') {
                embed.addTerminalField('SHADOW GAME POINTS', pointsBreakdown.sections.shadowGame);
            }
            if (pointsBreakdown.sections.arcade.trim() !== 'No arcade points') {
                embed.addTerminalField('ARCADE POINTS', pointsBreakdown.sections.arcade);
            }
            if (pointsBreakdown.sections.other.trim() !== 'No other points') {
                embed.addTerminalField('OTHER POINTS', pointsBreakdown.sections.other);
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
    }
};

function calculateRank(username, leaderboard, rankMetric) {
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
}

async function formatPointsBreakdown(points) {
    // Create sections for different point types
    const sections = {
        monthlyChallenge: '',
        shadowGame: '',
        arcade: '',
        other: ''
    };

    // Sort points by date (newest first) to show most recent first
    const sortedPoints = [...points].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
    );

    // Process each point entry
    for (const point of sortedPoints) {
        const entry = `• ${point.reason} (${point.points > 0 ? '+' : ''}${point.points})\n`;
        
        if (point.reason.includes('Monthly Challenge') || point.reason.includes('ALTTP') || point.reason.includes('Chrono Trigger')) {
            sections.monthlyChallenge += entry;
        } else if (point.reason.includes('Shadow Game') || point.reason.includes('U.N. Squadron')) {
            sections.shadowGame += entry;
        } else if (point.reason.includes('Arcade') || point.reason.includes('High Score')) {
            sections.arcade += entry;
        } else {
            sections.other += entry;
        }
    }

    // Clean up empty sections
    if (!sections.monthlyChallenge) sections.monthlyChallenge = 'No monthly challenge points\n';
    if (!sections.shadowGame) sections.shadowGame = 'No shadow game points\n';
    if (!sections.arcade) sections.arcade = 'No arcade points\n';
    if (!sections.other) sections.other = 'No other points\n';

    return { sections };
}

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

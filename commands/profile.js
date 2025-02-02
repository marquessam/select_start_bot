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
        // Group points by game and type
        const groupedPoints = new Map();

        for (const point of points) {
            // Handle both object and string reason formats
            const reason = typeof point.reason === 'object' ? point.reason.display : point.reason;
            const [gameName, type] = reason.split(' - ');
            const key = `${gameName}-${type}-${point.gameId}`;

            // Only add if we don't have this exact combination already
            if (!groupedPoints.has(key)) {
                groupedPoints.set(key, point);
            }
        }

        // Sort points into categories
        const categories = {
            participations: [],
            gamesBeaten: [],
            gamesMastered: []
        };

        for (const point of groupedPoints.values()) {
            let gameName = point.reason.split('-')[0].trim();

            // Shorten "The Legend of Zelda: A Link to the Past" to "Zelda: A Link to the Past"
            if (gameName.includes("The Legend of Zelda")) {
                gameName = gameName.replace("The Legend of", "");
            }

            const pointString = `${gameName} - ${point.points} point${point.points !== 1 ? 's' : ''}`;

            if (point.reason.toLowerCase().includes('participation')) {
                categories.participations.push(pointString);
            } else if (point.reason.toLowerCase().includes('beaten')) {
                categories.gamesBeaten.push(pointString);
            } else if (point.reason.toLowerCase().includes('mastery')) {
                categories.gamesMastered.push(pointString);
            }
        }

        return categories;
    },

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

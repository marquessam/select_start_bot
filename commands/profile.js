// commands/profile.js
const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

class ProfileCommand {
    constructor() {
        this.name = 'profile';
        this.description = 'Displays user profile and stats';
    }

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

            // Calculate rankings
            const yearlyRank = this.calculateRank(username, yearlyLeaderboard);
            const monthlyRank = this.calculateRank(username, monthlyLeaderboard);

            // Create embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username.toUpperCase()}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]');

            // Current Challenge Progress
            if (currentChallenge && userProgress) {
                embed.addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: "${currentChallenge.gameName || 'N/A'}"\n` +
                    `PROGRESS: ${userProgress.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${userProgress.completedAchievements || 0}/${userProgress.totalAchievements || 0}\n` +
                    (userProgress.hasBeatenGame ? '✅ Game Completed' : '⏳ In Progress')
                );
            }

            // Rankings
            const medals = { '1': '🥇', '2': '🥈', '3': '🥉' };
            const monthlyMedal = monthlyRank.startsWith('#') ? medals[monthlyRank.slice(1)] || '' : '';
            const yearlyMedal = yearlyRank.startsWith('#') ? medals[yearlyRank.slice(1)] || '' : '';

            embed.addTerminalField('RANKINGS',
                `MONTHLY: ${monthlyMedal} ${monthlyRank}\n` +
                `YEARLY: ${yearlyMedal} ${yearlyRank}`
            );

            // Points Breakdown
            const currentGames = await pointsManager.getCurrentMonthGames();
            const pointsBreakdown = this.formatPointsBreakdown(yearlyPoints, currentGames);

            // Monthly Games
            if (pointsBreakdown.monthlyGames.length > 0) {
                embed.addTerminalField('MONTHLY CHALLENGES',
                    pointsBreakdown.monthlyGames.join('\n'));
            }

            // Shadow Games
            if (pointsBreakdown.shadowGames.length > 0) {
                embed.addTerminalField('SHADOW GAMES',
                    pointsBreakdown.shadowGames.join('\n'));
            }

            // Masteries
            if (pointsBreakdown.mastery.length > 0) {
                embed.addTerminalField('MASTERY ACHIEVEMENTS',
                    pointsBreakdown.mastery.join('\n'));
            }

            // Calculate totals
            const totals = yearlyPoints.reduce((acc, p) => {
                acc.points += p.points;
                if (p.reason.toLowerCase().includes('participation')) acc.participations++;
                if (p.reason.toLowerCase().includes('beaten')) acc.gamesBeaten++;
                if (p.reason.toLowerCase().includes('mastery')) acc.gamesMastered++;
                return acc;
            }, { points: 0, participations: 0, gamesBeaten: 0, gamesMastered: 0 });

            // Add statistics
            embed.addTerminalField('STATISTICS',
                `Total Points: ${totals.points}\n` +
                `Games Participated: ${totals.participations}\n` +
                `Games Beaten: ${totals.gamesBeaten}\n` +
                `Games Mastered: ${totals.gamesMastered}`
            );

            // Set profile image if available
            if (raProfileImage) {
                embed.setThumbnail(raProfileImage);
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });

            if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);

        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    }

    formatPointsBreakdown(points, currentGames) {
        const uniquePoints = new Map();

        for (const point of points) {
            const reason = point.reason.display || point.reason;
            const [gameName, type] = reason.split(' - ');
            
            // Shorten game names
            const shortName = gameName
                .replace('The Legend of Zelda: ', '')
                .replace('Legend of Zelda: ', '')
                .trim();

            const key = `${shortName}-${type}-${point.gameId}`;
            
            if (!uniquePoints.has(key)) {
                uniquePoints.set(key, {
                    gameName: shortName,
                    type,
                    points: point.points,
                    gameId: point.gameId
                });
            }
        }

        // Categorize points
        const categories = {
            monthlyGames: [],
            shadowGames: [],
            mastery: []
        };

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

        // Sort each category
        categories.monthlyGames.sort();
        categories.shadowGames.sort();
        categories.mastery.sort();

        return categories;
    }

    calculateRank(username, leaderboard) {
        const user = leaderboard.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return 'No Rank';

        const metric = user.totalPoints || user.completionPercentage || 0;
        if (metric === 0) return 'No Rank';

        const sortedLeaderboard = leaderboard
            .filter(u => (u.totalPoints || u.completionPercentage) > 0)
            .sort((a, b) => (b.totalPoints || b.completionPercentage) - (a.totalPoints || a.completionPercentage));

        const rank = sortedLeaderboard.findIndex(u => 
            u.username.toLowerCase() === username.toLowerCase()
        ) + 1;

        return `#${rank}`;
    }
}

module.exports = new ProfileCommand();

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
                userProgress,
                currentChallenge,
                yearlyLeaderboard,
                monthlyLeaderboard,
                yearlyPoints,
                raProfileImage
            ] = await Promise.all([
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
            embed.addTerminalField('RANKINGS',
                `MONTHLY: ${monthlyRank.startsWith('#') ? `${medals[monthlyRank.slice(1)] || ''} ` : ''}${monthlyRank}\n` +
                `YEARLY: ${yearlyRank.startsWith('#') ? `${medals[yearlyRank.slice(1)] || ''} ` : ''}${yearlyRank}`
            );

            // Process points by game
            const gamePoints = new Map();
            
            for (const point of yearlyPoints) {
                const gameId = point.gameId;
                const type = point.reason.toLowerCase();
                const isParticipation = type.includes('participation');
                const isBeaten = type.includes('beaten');
                const isMastery = type.includes('mastery');

                if (!gamePoints.has(gameId)) {
                    gamePoints.set(gameId, {
                        name: point.reason.split(' - ')[0],
                        points: [],
                        displayOrder: []
                    });
                }

                const game = gamePoints.get(gameId);
                
                // Only add each type once
                if (isParticipation && !game.displayOrder.includes('participation')) {
                    game.points.push(`${game.name} - 1 point`);
                    game.displayOrder.push('participation');
                }
                if (isBeaten && !game.displayOrder.includes('beaten')) {
                    game.points.push(`${game.name} - 3 points`);
                    game.displayOrder.push('beaten');
                }
                if (isMastery && !game.displayOrder.includes('mastery')) {
                    game.points.push(`${game.name} - 3 points 🏆`);
                    game.displayOrder.push('mastery');
                }
            }

            // Display Monthly Challenges
            const currentGames = await pointsManager.getCurrentMonthGames();
            const monthlyPoints = [];
            const shadowPoints = [];
            const masteryPoints = [];

            for (const [gameId, game] of gamePoints) {
                const isCurrentMonthly = currentGames?.monthlyGame.id === gameId;
                const isCurrentShadow = currentGames?.shadowGame.id === gameId;
                const hasMastery = game.displayOrder.includes('mastery');

                if (hasMastery) {
                    masteryPoints.push(...game.points.filter(p => p.includes('🏆')));
                }

                const regularPoints = game.points.filter(p => !p.includes('🏆'));
                if (isCurrentMonthly || isCurrentShadow) {
                    if (isCurrentMonthly) {
                        monthlyPoints.push(...regularPoints.map(p => p + ' ⭐'));
                    } else {
                        shadowPoints.push(...regularPoints.map(p => p + ' 🌘'));
                    }
                } else {
                    monthlyPoints.push(...regularPoints);
                }
            }

            if (monthlyPoints.length > 0) {
                embed.addTerminalField('MONTHLY CHALLENGES', monthlyPoints.join('\n'));
            }
            if (shadowPoints.length > 0) {
                embed.addTerminalField('SHADOW GAMES', shadowPoints.join('\n'));
            }
            if (masteryPoints.length > 0) {
                embed.addTerminalField('MASTERY ACHIEVEMENTS', masteryPoints.join('\n'));
            }

            // Calculate totals
            const totals = this.calculateTotals(gamePoints);
            embed.addTerminalField('STATISTICS',
                `Total Points: ${totals.points}\n` +
                `Games Participated: ${totals.participated}\n` +
                `Games Beaten: ${totals.beaten}\n` +
                `Games Mastered: ${totals.mastered}`
            );

            if (raProfileImage) {
                embed.setThumbnail(raProfileImage);
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
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

    calculateTotals(gamePoints) {
        const totals = {
            points: 0,
            participated: 0,
            beaten: 0,
            mastered: 0
        };

        for (const game of gamePoints.values()) {
            if (game.displayOrder.includes('participation')) {
                totals.participated++;
                totals.points += 1;
            }
            if (game.displayOrder.includes('beaten')) {
                totals.beaten++;
                totals.points += 3;
            }
            if (game.displayOrder.includes('mastery')) {
                totals.mastered++;
                totals.points += 3;
            }
        }

        return totals;
    }
}

module.exports = new ProfileCommand();

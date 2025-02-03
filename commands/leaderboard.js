// commands/leaderboard.js
const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

module.exports = {
    name: 'leaderboard',
    description: 'Displays monthly or yearly leaderboards',
    
    async execute(message, args, { shadowGame, achievementSystem }) {
        try {
            if (!args.length) {
                await message.channel.send('```ansi\n\x1b[32m> Accessing leaderboard options...\x1b[0m\n```');

                const embed = new TerminalEmbed()
                    .setTerminalTitle('LEADERBOARD OPTIONS')
                    .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[SELECT AN OPTION]\n')
                    .addTerminalField('USAGE',
                        '1. !leaderboard month - View monthly challenge leaderboard\n' +
                        '2. !leaderboard year - View yearly challenge leaderboard')
                    .setTerminalFooter();

                await message.channel.send({ embeds: [embed] });
                return;
            }

            switch(args[0].toLowerCase()) {
                case 'month':
                    await this.displayMonthlyLeaderboard(message, achievementSystem);
                    break;
                case 'year':
                    await this.displayYearlyLeaderboard(message, achievementSystem);
                    break;
                default:
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid option\n[Ready for input]█\x1b[0m```');
            }

            if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayMonthlyLeaderboard(message, achievementSystem) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing monthly rankings...\x1b[0m\n```');

            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            // Get all users' progress
            const validUsers = await DataService.getValidUsers();
            const userAchievements = await Promise.all(
                validUsers.map(async username => {
                    const points = await achievementSystem.calculatePoints(username, currentMonth, currentYear);
                    const progress = await DataService.getUserProgress(username);
                    
                    return {
                        username,
                        points: points.total,
                        games: points.games,
                        completionPercentage: progress.completionPercentage,
                        completedAchievements: progress.completedAchievements,
                        totalAchievements: progress.totalAchievements
                    };
                })
            );

            // Sort users by points
            const rankedUsers = userAchievements
                .filter(user => user.points > 0)
                .sort((a, b) => b.points - a.points)
                .map((user, index) => ({
                    ...user,
                    rank: index + 1
                }));

            // Get current challenge info
            const currentChallenge = await DataService.getCurrentChallenge();

            // Create embed
            const embed = new TerminalEmbed()
                .setTerminalTitle('MONTHLY RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

            if (currentChallenge) {
                embed.addTerminalField('CURRENT CHALLENGE',
                    `GAME: ${currentChallenge.gameName}\n` +
                    `DATES: ${currentChallenge.startDate} to ${currentChallenge.endDate}`
                );

                if (currentChallenge.gameIcon) {
                    embed.setThumbnail(`https://retroachievements.org${currentChallenge.gameIcon}`);
                }
            }

            // Add rankings
            if (rankedUsers.length > 0) {
                const medals = ['🥇', '🥈', '🥉'];
                rankedUsers.forEach(user => {
                    const medal = user.rank <= 3 ? medals[user.rank - 1] : '';
                    
                    // Build achievement breakdown for each game
                    const gameBreakdown = Object.entries(user.games)
                        .map(([gameId, game]) => {
                            const achievements = [];
                            game.achievements.forEach(ach => {
                                switch(ach.type) {
                                    case 'participation': achievements.push('✓ Participation'); break;
                                    case 'beaten': achievements.push('✓ Completion'); break;
                                    case 'mastery': achievements.push('✓ Mastery'); break;
                                }
                            });
                            return `${game.name}:\n${achievements.join('\n')}`;
                        })
                        .join('\n\n');

                    embed.addTerminalField(
                        `${medal} #${user.rank} ${user.username}`,
                        `PROGRESS: ${user.completionPercentage}%\n` +
                        `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\n` +
                        `MONTHLY POINTS: ${user.points}\n\n` +
                        `${gameBreakdown}`
                    );
                });
            } else {
                embed.addTerminalField('STATUS', 'No rankings available yet');
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Monthly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve monthly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayYearlyLeaderboard(message, achievementSystem) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');

            const currentYear = new Date().getFullYear();
            const validUsers = await DataService.getValidUsers();

            // Get all users' yearly achievements
            const userAchievements = await Promise.all(
                validUsers.map(async username => {
                    const points = await achievementSystem.calculatePoints(username, null, currentYear);
                    
                    // Count achievement types
                    const gameStats = Object.values(points.games).reduce((acc, game) => {
                        if (game.achievements.some(a => a.type === 'beaten')) acc.gamesBeaten++;
                        if (game.achievements.some(a => a.type === 'mastery')) acc.gamesMastered++;
                        acc.gamesParticipated++;
                        return acc;
                    }, { gamesParticipated: 0, gamesBeaten: 0, gamesMastered: 0 });

                    return {
                        username,
                        total: points.total,
                        ...gameStats
                    };
                })
            );

            // Sort users by points
            const rankedUsers = userAchievements
                .filter(user => user.total > 0)
                .sort((a, b) => b.total - a.total)
                .map((user, index) => ({
                    ...user,
                    rank: index + 1
                }));

            const embed = new TerminalEmbed()
                .setTerminalTitle('YEARLY RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

            if (rankedUsers.length > 0) {
                const medals = ['🥇', '🥈', '🥉'];
                rankedUsers.forEach(user => {
                    const medal = user.rank <= 3 ? medals[user.rank - 1] : '';
                    embed.addTerminalField(
                        `${medal} #${user.rank} ${user.username}`,
                        `TOTAL POINTS: ${user.total}\n` +
                        `GAMES PARTICIPATED: ${user.gamesParticipated}\n` +
                        `GAMES BEATEN: ${user.gamesBeaten}\n` +
                        `GAMES MASTERED: ${user.gamesMastered}`
                    );
                });
            } else {
                embed.addTerminalField('STATUS', 'No rankings available');
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Yearly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    }
};

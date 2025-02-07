// commands/leaderboard.js
const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

function formatDate(date) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    const suffix = ['th', 'st', 'nd', 'rd'][(day > 3 && day < 21) || day % 10 > 3 ? 0 : day % 10];
    return `${month} ${day}${suffix}, ${year} at ${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function getTimeRemaining(endDate) {
    const now = new Date();
    const timeLeft = endDate - now;
    
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
        return `${days} day${days !== 1 ? 's' : ''} and ${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
}

class LeaderboardCommand {
    constructor() {
        this.name = 'leaderboard';
        this.description = 'Display monthly or yearly leaderboards';
    }

    async execute(message, args, { shadowGame, pointsManager }) {
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
                if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);
                return;
            }

            switch(args[0].toLowerCase()) {
                case 'month':
                    await this.displayMonthlyLeaderboard(message, shadowGame);
                    break;
                case 'year':
                    await this.displayYearlyLeaderboard(message, shadowGame, pointsManager);
                    break;
                default:
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid option\nUse !leaderboard to see available options\n[Ready for input]█\x1b[0m```');
            }
        } catch (error) {
            console.error('Leaderboard Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to process leaderboard command\n[Ready for input]█\x1b[0m```');
        }
    }

    async displayYearlyLeaderboard(message, shadowGame, pointsManager) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');

            const validUsers = await DataService.getValidUsers();
            const year = new Date().getFullYear().toString();

            const userStats = await Promise.all(
                validUsers.map(async username => {
                    const yearlyPoints = await pointsManager.getUserPoints(username, year);
                    
                    // Process points by game
                    const gamePoints = new Map();
                    
                    for (const point of yearlyPoints) {
                        const gameId = point.gameId;
                        const type = point.reason.toLowerCase();
                        
                        if (!gamePoints.has(gameId)) {
                            gamePoints.set(gameId, {
                                participation: false,
                                beaten: false,
                                mastery: false,
                                points: 0
                            });
                        }
                        
                        const game = gamePoints.get(gameId);
                        
                        // Only count each type once per game
                        if (type.includes('participation') && !game.participation) {
                            game.participation = true;
                            game.points += 1;
                        }
                        if (type.includes('beaten') && !game.beaten) {
                            game.beaten = true;
                            game.points += 3;
                        }
                        if (type.includes('mastery') && !game.mastery) {
                            game.mastery = true;
                            game.points += 3;
                        }
                    }

                    // Calculate totals
                    const totals = {
                        totalPoints: 0,
                        gamesJoined: 0,
                        gamesBeaten: 0,
                        gamesMastered: 0
                    };

                    for (const game of gamePoints.values()) {
                        totals.totalPoints += game.points;
                        if (game.participation) totals.gamesJoined++;
                        if (game.beaten) totals.gamesBeaten++;
                        if (game.mastery) totals.gamesMastered++;
                    }

                    return {
                        username,
                        ...totals
                    };
                })
            );

            // Sort users by points and other criteria
            const rankedUsers = userStats
                .filter(user => user.totalPoints > 0)
                .sort((a, b) => {
                    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
                    if (a.gamesBeaten !== b.gamesBeaten) return b.gamesBeaten - a.gamesBeaten;
                    return b.gamesMastered - a.gamesMastered;
                })
                .map((user, index) => ({ ...user, rank: index + 1 }));

            const embed = new TerminalEmbed()
                .setTerminalTitle('YEARLY RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

            // Split rankings into chunks of 5 users
            const chunks = [];
            for (let i = 0; i < rankedUsers.length; i += 5) {
                chunks.push(rankedUsers.slice(i, i + 5));
            }

            chunks.forEach((chunk, index) => {
                const fieldTitle = `RANKINGS ${index * 5 + 1}-${Math.min((index + 1) * 5, rankedUsers.length)}`;
                const fieldContent = chunk.map(user => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const medal = user.rank <= 3 ? medals[user.rank - 1] : '';
                    return `${medal} #${user.rank} ${user.username}: ${user.totalPoints} points\n` +
                           `   ┗ Games: ${user.gamesJoined} joined, ${user.gamesBeaten} beaten, ${user.gamesMastered} mastered`;
                }).join('\n\n');

                embed.addTerminalField(fieldTitle, fieldContent);
            });

            if (rankedUsers.length === 0) {
                embed.addTerminalField('STATUS', 'No rankings available');
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Yearly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    }

    async displayMonthlyLeaderboard(message, shadowGame) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing monthly rankings...\x1b[0m\n```');

            const [leaderboardData, currentChallenge] = await Promise.all([
                DataService.getLeaderboard('monthly'),
                DataService.getCurrentChallenge()
            ]);

            const validUsers = await DataService.getValidUsers();
            const activeUsers = leaderboardData.filter(user =>
                validUsers.includes(user.username.toLowerCase()) &&
                (user.completedAchievements > 0 || parseFloat(user.completionPercentage) > 0)
            );

            const rankedUsers = this.rankUsersByProgress(activeUsers);
            
            const endOfMonth = new Date();
            endOfMonth.setMonth(endOfMonth.getMonth() + 1);
            endOfMonth.setDate(0);
            endOfMonth.setHours(23, 59, 59, 999);

            const monthName = new Date().toLocaleString('default', { month: 'long' });
            const timeRemaining = getTimeRemaining(endOfMonth);

            const embed = new TerminalEmbed()
                .setTerminalTitle('USER RANKINGS')
                .setThumbnail(`https://retroachievements.org${currentChallenge?.gameIcon || ''}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]')
                .addTerminalField(`${monthName.toUpperCase()} CHALLENGE`, 
                    `GAME: ${currentChallenge?.gameName || 'Unknown'}\n` +
                    `TOTAL ACHIEVEMENTS: ${activeUsers[0]?.totalAchievements || 0}\n` +
                    `CHALLENGE ENDS: ${formatDate(endOfMonth)}\n` +
                    `TIME REMAINING: ${timeRemaining}`
                );

            // Split users into chunks of 5 for display
            const chunks = [];
            for (let i = 0; i < rankedUsers.length; i += 5) {
                chunks.push(rankedUsers.slice(i, i + 5));
            }

            chunks.forEach((chunk, index) => {
                const startRank = index * 5 + 1;
                const endRank = Math.min((index + 1) * 5, rankedUsers.length);
                
                const fieldContent = chunk.map(user => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const medal = user.rank <= 3 ? medals[user.rank - 1] : '';
                    return `${medal} #${user.rank} ${user.username}\n` +
                           `   ┗ ${user.completedAchievements}/${user.totalAchievements} (${user.completionPercentage}%)`;
                }).join('\n\n');

                embed.addTerminalField(`RANKINGS ${startRank}-${endRank}`, fieldContent);
            });

            if (activeUsers.length === 0) {
                embed.addTerminalField('STATUS', 'No active participants yet');
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Monthly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve monthly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    }

    rankUsersByProgress(users) {
        return users
            .sort((a, b) => {
                const percentDiff = parseFloat(b.completionPercentage) - parseFloat(a.completionPercentage);
                if (percentDiff !== 0) return percentDiff;
                return b.completedAchievements - a.completedAchievements;
            })
            .map((user, index) => ({
                ...user,
                rank: index + 1,
                displayInMain: index < 3
            }));
    }
}

module.exports = new LeaderboardCommand();

// commands/leaderboard.js
const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');
const { monthlySchedule } = require('../pointsConfig');

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
                        ' Secret Chime - [W2K5MN]\n' +
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

            // Get this month's games
            const monthlyGames = monthlySchedule[currentYear]?.[currentMonth];
            if (!monthlyGames) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No active challenges for this month\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Get all users' points
            const users = await DataService.getValidUsers();
            const userPoints = await Promise.all(
                users.map(async username => {
                    const points = await achievementSystem.calculatePoints(username, currentMonth, currentYear);
                    return {
                        username,
                        points: points.total,
                        games: points.games
                    };
                })
            );

            // Sort users by points
            const rankedUsers = userPoints
                .filter(user => user.points > 0)
                .sort((a, b) => b.points - a.points)
                .map((user, index) => ({
                    ...user,
                    rank: index + 1
                }));

            // Create embed
            const embed = new TerminalEmbed()
                .setTerminalTitle('MONTHLY RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

            // Add main challenge info
            const mainGameName = achievementSystem.getGameName(monthlyGames.main);
            const shadowGameName = achievementSystem.getGameName(monthlyGames.shadow);
            
            embed.addTerminalField('ACTIVE CHALLENGES',
                `MAIN: ${mainGameName}\n` +
                `SHADOW: ${shadowGameName}\n` +
                `TIME REMAINING: ${getTimeRemaining(new Date(currentYear, currentMonth, 0))}`
            );

            // Add rankings
            if (rankedUsers.length > 0) {
                const medals = ['🥇', '🥈', '🥉'];
                rankedUsers.forEach(user => {
                    const medal = user.rank <= 3 ? medals[user.rank - 1] : '';
                    const gameBreakdown = Object.values(user.games)
                        .map(game => `${game.name}: ${game.points}`)
                        .join('\n');

                    embed.addTerminalField(
                        `${medal} #${user.rank} ${user.username}`,
                        `${gameBreakdown}\nTOTAL: ${user.points} points`
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
            const users = await DataService.getValidUsers();

            // Get all users' yearly points
            const userPoints = await Promise.all(
                users.map(async username => {
                    const points = await achievementSystem.calculatePoints(username, null, currentYear);
                    return {
                        username,
                        total: points.total,
                        gameCount: Object.keys(points.games).length
                    };
                })
            );

            // Sort users by points
            const rankedUsers = userPoints
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
                        `GAMES: ${user.gameCount}`
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

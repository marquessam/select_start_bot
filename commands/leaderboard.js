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

module.exports = {
    name: 'leaderboard',
    description: 'Display monthly or yearly leaderboards',
    
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

            const subcommand = args[0].toLowerCase();

            switch(subcommand) {
                case 'month':
                    await this.displayMonthlyLeaderboard(message, shadowGame);
                    break;
                case 'year':
                    await this.displayYearlyLeaderboard(message, shadowGame, pointsManager);
                    break;
                default:
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid option\nUse !leaderboard to see available options\n[Ready for input]█\x1b[0m```');
                    if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);
            }
        } catch (error) {
            console.error('Leaderboard Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to process leaderboard command\n[Ready for input]█\x1b[0m```');
        }
    },

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

            // Add top rankings
            for (const user of rankedUsers) {
                if (!user.displayInMain && user.rank > 3) continue;

                const medals = ['🥇', '🥈', '🥉'];
                const medal = user.rank <= 3 ? medals[user.rank - 1] : '';

                embed.addTerminalField(
                    `${medal} RANK #${user.rank} - ${user.username}`,
                    `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\n` +
                    `PROGRESS: ${user.completionPercentage}%`
                );
            }

            // Add remaining participants
            const remainingUsers = rankedUsers.filter(user => !user.displayInMain);
            if (remainingUsers.length > 0) {
                const remainingText = remainingUsers
                    .map(user => `#${user.rank} ${user.username} (${user.completionPercentage}%)`)
                    .join('\n');

                embed.addTerminalField('ADDITIONAL PARTICIPANTS', remainingText);
            }

            if (activeUsers.length === 0) {
                embed.addTerminalField('STATUS', 'No active participants yet');
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);

        } catch (error) {
            console.error('Monthly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve monthly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayYearlyLeaderboard(message, shadowGame, pointsManager) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');

            const validUsers = await DataService.getValidUsers();
            const year = new Date().getFullYear().toString();

            // Get points for all users
            const userPoints = await Promise.all(
                validUsers.map(async username => {
                    const points = await pointsManager.getUserPoints(username, year);
                    
                    // Count achievements and categorize points
                    const stats = points.reduce((acc, p) => {
                        acc.totalPoints += p.points;
                        
                        if (p.reason.toLowerCase().includes('participation')) acc.participations++;
                        if (p.reason.toLowerCase().includes('beaten')) acc.gamesBeaten++;
                        if (p.reason.toLowerCase().includes('mastery')) acc.gamesMastered++;
                        
                        return acc;
                    }, { 
                        totalPoints: 0, 
                        participations: 0, 
                        gamesBeaten: 0, 
                        gamesMastered: 0 
                    });

                    return {
                        username,
                        ...stats
                    };
                })
            );

            // Filter and sort users
            const rankedUsers = userPoints
                .filter(user => user.totalPoints > 0)
                .sort((a, b) => {
                    // Sort by total points first
                    if (b.totalPoints !== a.totalPoints) {
                        return b.totalPoints - a.totalPoints;
                    }
                    // Then by games beaten
                    if (b.gamesBeaten !== a.gamesBeaten) {
                        return b.gamesBeaten - a.gamesBeaten;
                    }
                    // Then by masteries
                    return b.gamesMastered - a.gamesMastered;
                })
                .map((user, index) => ({
                    ...user,
                    rank: index + 1
                }));

            const embed = new TerminalEmbed()
                .setTerminalTitle('YEARLY RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

if (rankedUsers.length > 0) {
    // Split users into chunks of 5 for display
    const chunks = [];
    for (let i = 0; i < rankedUsers.length; i += 5) {
        chunks.push(rankedUsers.slice(i, i + 5));
    }

    // Display each chunk in its own field
    chunks.forEach((chunk, index) => {
        const startRank = index * 5 + 1;
        const endRank = Math.min((index + 1) * 5, rankedUsers.length);
        
        embed.addTerminalField(
            `RANKINGS ${startRank}-${endRank}`,
            chunk.map(user => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = user.rank <= 3 ? medals[user.rank - 1] : '';
                return `${medal} #${user.rank} ${user.username}: ${user.totalPoints} points\n` +
                       `   ┗ Games: ${user.participations} joined, ${user.gamesBeaten} beaten, ${user.gamesMastered} mastered`;
            }).join('\n\n')
        );
    });
} else {
    embed.addTerminalField('STATUS', 'No rankings available');
}
            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);

        } catch (error) {
            console.error('Yearly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },

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
};

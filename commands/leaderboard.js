// commands/leaderboard.js

const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

// Helper function to format date nicely
function formatDate(date) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Add ordinal suffix to day
    const suffix = ['th', 'st', 'nd', 'rd'][(day > 3 && day < 21) || day % 10 > 3 ? 0 : day % 10];
    
    return `${month} ${day}${suffix}, ${year} at ${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

// Helper function to calculate time remaining
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

    async execute(message, args, { shadowGame }) {
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
                if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);
                return;
            }

            const subcommand = args[0].toLowerCase();

            switch(subcommand) {
                case 'month':
                    await this.displayMonthlyLeaderboard(message, shadowGame);
                    break;
                case 'year':
                    await this.displayYearlyLeaderboard(message, shadowGame);
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

            const rankedUsers = this.rankUsersWithTies(activeUsers);
            
            // Create end of month date
            const endOfMonth = new Date();
            endOfMonth.setMonth(endOfMonth.getMonth() + 1);
            endOfMonth.setDate(0); // Last day of current month
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

            // Add remaining participants if any
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

            embed.setFooter({ text: `Rankings Updated: [W2K5MN]` });
            embed.setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);

        } catch (error) {
            console.error('Monthly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve monthly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },
    rankUsersWithTies(users) {
        const sortedUsers = [...users].sort((a, b) => {
            const percentDiff = parseFloat(b.completionPercentage) - parseFloat(a.completionPercentage);
            if (percentDiff !== 0) return percentDiff;
            return b.completedAchievements - a.completedAchievements;
        });

        let currentRank = 1;
        let previousScore = null;
        let displayInMainCount = 0;

        return sortedUsers.map((entry, index) => {
            const currentScore = `${entry.completionPercentage}-${entry.completedAchievements}`;

            if (previousScore !== currentScore) {
                currentRank = index + 1;
                previousScore = currentScore;
            }

            const displayInMain = currentRank <= 3;
            if (displayInMain) displayInMainCount++;

            return {
                ...entry,
                rank: currentRank,
                displayInMain
            };
        });
    },

    async displayYearlyLeaderboard(message, shadowGame) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing HERO\'S RECORD...\x1b[0m\n```');

            const yearlyLeaderboard = await DataService.getLeaderboard('yearly');
            const validUsers = await DataService.getValidUsers();

            const activeUsers = yearlyLeaderboard
                .filter(user => validUsers.includes(user.username.toLowerCase()) && user.points > 0)
                .sort((a, b) => b.points - a.points);

            let currentRank = 1;
            let previousPoints = null;

            const rankedLeaderboard = activeUsers.map((user, index) => {
                if (previousPoints !== user.points) {
                    currentRank = index + 1;
                    previousPoints = user.points;
                }
                
                return {
                    ...user,
                    rank: currentRank
                };
            });

            const embed = new TerminalEmbed()
                .setTerminalTitle('YEARLY RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS][C5V5BN]');

            if (rankedLeaderboard.length > 0) {
                embed.addTerminalField('TOP USERS',
                    rankedLeaderboard
                        .map(user => {
                            const medals = ['🥇', '🥈', '🥉'];
                            const medal = user.rank <= 3 ? medals[user.rank - 1] : '';
                            return `${medal} #${user.rank} ${user.username}: ${user.points} points`;
                        })
                        .join('\n'));
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
    }
};

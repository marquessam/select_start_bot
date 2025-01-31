const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');
const { createTimestamp } = require('../utils/timerFunctions');

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
            const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
            const monthName = new Date().toLocaleString('default', { month: 'long' });

            const embed = new TerminalEmbed()
                .setTerminalTitle('USER RANKINGS')
                .setThumbnail(`https://retroachievements.org${currentChallenge?.gameIcon || ''}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]')
                .addTerminalField(`${monthName.toUpperCase()} CHALLENGE`, 
                    `GAME: ${currentChallenge?.gameName || 'Unknown'}\n` +
                    `TOTAL ACHIEVEMENTS: ${activeUsers[0]?.totalAchievements || 0}\n` +
                    `CHALLENGE ENDS: ${createTimestamp(monthEnd, 'F')}\n` +
                    `TIME REMAINING: ${createTimestamp(monthEnd, 'R')}`
                );

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

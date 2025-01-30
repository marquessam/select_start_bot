const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

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
                if (shadowGame) await shadowGame.tryShowError(message);
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
                    if (shadowGame) await shadowGame.tryShowError(message);
            }
        } catch (error) {
            console.error('Leaderboard Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to process leaderboard command\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayMonthlyLeaderboard(message, shadowGame) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing monthly rankings...\x1b[0m\n```');

            // Fetch all required data
            const [leaderboardData, currentChallenge, shadowGameData] = await Promise.all([
                DataService.getLeaderboard('monthly'),
                DataService.getCurrentChallenge(),
                shadowGame?.config || null
            ]);

            // Get valid users and filter for active participants
            const validUsers = await DataService.getValidUsers();
            const activeUsers = leaderboardData.filter(user =>
                validUsers.includes(user.username.toLowerCase()) &&
                (user.completedAchievements > 0 || parseFloat(user.completionPercentage) > 0)
            );

            // Calculate combined percentages and rank users
            const rankedUsers = this.rankUsersWithCombinedProgress(activeUsers, shadowGameData);

           const embed = new TerminalEmbed()
            .setTerminalTitle('USER RANKINGS')
            .setThumbnail(`https://retroachievements.org${currentChallenge?.gameIcon || ''}`)
            .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]')
            .addTerminalField('CURRENT CHALLENGE', 
                `GAME: ${currentChallenge?.gameName || 'Unknown'}\n` +
                `TOTAL ACHIEVEMENTS: ${activeUsers[0]?.totalAchievements || 0}` +
                (shadowGameData?.active && shadowGameData?.currentProgress >= shadowGameData.puzzles.length ? 
                    `\nSHADOW GAME: ${shadowGameData.finalReward.gameName}` : '')
            );

            // Add top rankings
            for (const user of rankedUsers) {
                if (!user.displayInMain && user.rank > 3) continue;

                const medals = ['🥇', '🥈', '🥉'];
                const medal = user.rank <= 3 ? medals[user.rank - 1] : '';

                let progressText = `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\n` +
                                 `PROGRESS: ${user.completionPercentage}%`;

                if (user.shadowProgress) {
                    progressText += `\nSHADOW GAME: ${user.shadowProgress.completed}/${user.shadowProgress.total} (${user.shadowProgress.percentage}%)`;
                }

                embed.addTerminalField(
                    `${medal} RANK #${user.rank} - ${user.username}`,
                    progressText
                );
            }

            // Add remaining participants if any
            const remainingUsers = rankedUsers.filter(user => !user.displayInMain);
            if (remainingUsers.length > 0) {
                const remainingText = remainingUsers
                    .map(user => `RANK #${user.rank} - ${user.username} (${user.completionPercentage}%)`)
                    .join('\n');

                embed.addTerminalField('ADDITIONAL PARTICIPANTS', remainingText);
            }

            if (activeUsers.length === 0) {
                embed.addTerminalField('STATUS', 'No active participants yet');
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            if (shadowGame) await shadowGame.tryShowError(message);

        } catch (error) {
            console.error('Monthly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve monthly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },

    rankUsersWithCombinedProgress(users, shadowGameData) {
        // Calculate combined percentages for each user
        const usersWithCombined = users.map(user => {
            const monthlyPercentage = parseFloat(user.completionPercentage);
            let shadowProgress = null;
            let combinedPercentage = monthlyPercentage;

            // Only consider shadow game if monthly is 100% and shadow game is active
            if (monthlyPercentage === 100 && shadowGameData?.active && shadowGameData?.finalReward) {
                const shadowAchievements = user.achievements.filter(
                    a => a.GameID === shadowGameData.finalReward.gameId
                );
                const completedShadow = shadowAchievements.filter(a => parseInt(a.DateEarned) > 0).length;
                const totalShadow = shadowAchievements.length;
                const shadowPercentage = (completedShadow / totalShadow) * 100;

                shadowProgress = {
                    completed: completedShadow,
                    total: totalShadow,
                    percentage: shadowPercentage.toFixed(2)
                };

                // Direct addition of percentages
                combinedPercentage = monthlyPercentage + shadowPercentage;
            }

            return {
                ...user,
                shadowProgress,
                combinedPercentage
            };
        });

        // Sort users by combined percentage and then by achievements
        const sortedUsers = [...usersWithCombined].sort((a, b) => {
            if (a.combinedPercentage !== b.combinedPercentage) {
                return b.combinedPercentage - a.combinedPercentage;
            }
            return b.completedAchievements - a.completedAchievements;
        });

        // Assign ranks with tie handling
        let currentRank = 1;
        let previousScore = null;
        let displayInMainCount = 0;

        return sortedUsers.map((user, index) => {
            const currentScore = `${user.combinedPercentage}-${user.completedAchievements}`;

            if (previousScore !== currentScore) {
                currentRank = index + 1;
                previousScore = currentScore;
            }

            // Determine if this user should be displayed in main rankings
            const displayInMain = currentRank <= 3;

            if (displayInMain) displayInMainCount++;

            return {
                ...user,
                rank: currentRank,
                displayInMain
            };
        });
    },

    async displayYearlyLeaderboard(message, shadowGame) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');

            const yearlyLeaderboard = await DataService.getLeaderboard('yearly');
            const validUsers = await DataService.getValidUsers();

            // Filter for valid and active users and sort by points
            const activeUsers = yearlyLeaderboard
                .filter(user => validUsers.includes(user.username.toLowerCase()) && user.points > 0)
                .sort((a, b) => b.points - a.points);

            let currentRank = 1;
            let previousPoints = null;

            // Assign ranks properly
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
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

            if (rankedLeaderboard.length > 0) {
                embed.addTerminalField('TOP USERS',
                    rankedLeaderboard
                        .map(user => {
                            const medals = ['🥇', '🥈', '🥉'];
                            const medal = user.rank <= 3 ? medals[user.rank - 1] : '';
                            return `${medal} ${user.rank}. ${user.username}: ${user.points} points`;
                        })
                        .join('\n'));
            } else {
                embed.addTerminalField('STATUS', 'No rankings available');
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            if (shadowGame) await shadowGame.tryShowError(message);

        } catch (error) {
            console.error('Yearly Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    }
};

const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

module.exports = {
    name: 'leaderboard',
    description: 'Displays monthly, yearly, or high score leaderboards',

    async execute(message, args, { shadowGame }) {
        try {
            if (!args.length) {
                await message.channel.send('```ansi\n\x1b[32m> Accessing leaderboard options...\x1b[0m\n```');

                const embed = new TerminalEmbed()
                    .setTerminalTitle('LEADERBOARD OPTIONS')
                    .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[SELECT AN OPTION]\n')
                    .addTerminalField('USAGE',
                        '1. !leaderboard month - View monthly challenge leaderboard\n' +
                        '2. !leaderboard year - View yearly challenge leaderboard\n' +
                        '3. !leaderboard highscores - View game high scores')
                    .setTerminalFooter();

                await message.channel.send({ embeds: [embed] });
                if (shadowGame) await shadowGame.tryShowError(message);
                return;
            }

            const subcommand = args[0].toLowerCase();

            if (subcommand === 'month') {
                await this.displayMonthlyLeaderboard(message, shadowGame);
            } else if (subcommand === 'year') {
                await this.displayYearlyLeaderboard(message, shadowGame);
            } else if (subcommand === 'highscores') {
                await this.displayHighScores(message, args.slice(1), shadowGame);
            } else {
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

            const leaderboardData = await DataService.getLeaderboard('monthly');
            const currentChallenge = await DataService.getCurrentChallenge();

            // Filter out users with 0 progress
            const validUsers = await DataService.getValidUsers();
            const activeUsers = leaderboardData.filter(user =>
                validUsers.includes(user.username.toLowerCase()) &&
                (user.completedAchievements > 0 || parseFloat(user.completionPercentage) > 0)
            );

            const embed = new TerminalEmbed()
                .setTerminalTitle('USER RANKINGS')
                .setThumbnail(`https://retroachievements.org${currentChallenge?.gameIcon || ''}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]');

            // Display top 3
            activeUsers.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                embed.addTerminalField(
                    `${medals[index]} ${user.username}`,
                    `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\nPROGRESS: ${user.completionPercentage}%`
                );
            });

            // Display remaining active participants
            const additionalParticipants = activeUsers.slice(3)
                .map(user => `${user.username} (${user.completionPercentage}%)`)
                .join('\n');

            if (additionalParticipants) {
                embed.addTerminalField('ADDITIONAL PARTICIPANTS', additionalParticipants);
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

   async displayYearlyLeaderboard(message, shadowGame) {
    try {
        await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');

        const yearlyLeaderboard = await DataService.getLeaderboard('yearly');
        const validUsers = await DataService.getValidUsers();

        // Filter for valid and active users
        const activeUsers = yearlyLeaderboard.filter(user =>
            validUsers.includes(user.username.toLowerCase()) &&
            user.points > 0
        );

        // 1) Sort in descending order by points
        const sortedActiveUsers = activeUsers.sort((a, b) => b.points - a.points);

        // Initialize ranking variables
        let currentPoints = null;
        let currentRank = 1;
        let sameRankCount = 0;

        // 2) Map through the sorted list to assign ranks
        const rankedLeaderboard = sortedActiveUsers.map((user, index) => {
            // If this user's points differ from the "previous" user's points...
            if (user.points !== currentPoints) {
                // Increase the rank by however many users had the same points
                currentRank += sameRankCount;
                sameRankCount = 0;
                currentPoints = user.points;
            } else {
                // If the points are the same, increment the count of ties
                sameRankCount++;
            }

            return {
                ...user,
                rank: currentRank,
            };
        });

        // Now `rankedLeaderboard` should have users sorted by points
        // and assigned a rank accordingly.
        console.log(rankedLeaderboard);

        // Your code to display or return the leaderboard goes here
        // e.g., formatting the leaderboard for Discord, etc.
    } catch (error) {
        console.error(error);
        // Handle the error (e.g., send a message to the channel)
    }
}


    async displayHighScores(message, args, shadowGame) {
        try {
            const highscores = await DataService.getArcadeScores();

            if (!args.length) {
                await message.channel.send('```ansi\n\x1b[32m> Accessing high score database...\x1b[0m\n```');

                const embed = new TerminalEmbed()
                    .setTerminalTitle('HIGH SCORE BOARDS')
                    .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[SELECT A GAME TO VIEW RANKINGS]\n')
                    .addTerminalField('AVAILABLE GAMES',
                        Object.entries(highscores.games)
                            .map(([gameName, gameData], index) => {
                                const hasScores = gameData.scores.length > 0 ? '✓' : ' ';
                                return `${index + 1}. ${gameName} (${gameData.platform}) ${hasScores}`;
                            })
                            .join('\n') + '\n\n✓ = Scores recorded')
                    .addTerminalField('USAGE', '!leaderboard highscores <game number>\nExample: !leaderboard highscores 1')
                    .setTerminalFooter();

                await message.channel.send({ embeds: [embed] });
                if (shadowGame) await shadowGame.tryShowError(message);
                return;
            }

            const gameNumber = parseInt(args[0]);
            const games = Object.entries(highscores.games);

            if (isNaN(gameNumber) || gameNumber < 1 || gameNumber > games.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid game number\nUse !leaderboard highscores to see available games\n[Ready for input]█\x1b[0m```');
                if (shadowGame) await shadowGame.tryShowError(message);
                return;
            }

            const [gameName, gameData] = games[gameNumber - 1];

            const embed = new TerminalEmbed()
                .setTerminalTitle(`${gameName} HIGH SCORES`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING RANKINGS]');

            if (gameData.scores.length > 0) {
                embed.addTerminalField('RANKINGS',
                    gameData.scores
                        .map((score, index) => {
                            const medals = ['🥇', '🥈', '🥉'];
                            return `${medals[index] || ''} ${score.username}: ${score.score}`;
                        })
                        .join('\n'));
            } else {
                embed.addTerminalField('STATUS', 'No scores recorded yet');
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            if (shadowGame) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('High Scores Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve high scores\n[Ready for input]█\x1b[0m```');
        }
    },
};

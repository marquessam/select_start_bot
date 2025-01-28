const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

// Hard-coded values from your environment
const LEADERBOARD_CHANNEL_ID = '1333742125464158228';
const MONTHLY_MESSAGE_ID = '1333742295627071570';
const YEARLY_MESSAGE_ID = '1333742314002190377';

module.exports = {
    name: 'leaderboard',
    description: 'Displays monthly, yearly, or high score leaderboards',

    // ======================================
    // MAIN COMMAND EXECUTION
    // ======================================
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
                        '3. !leaderboard highscores - View game high scores\n' +
                        '4. !leaderboard refresh - Force an update of pinned leaderboards\n'
                    )
                    .setTerminalFooter();

                await message.channel.send({ embeds: [embed] });
                if (shadowGame) await shadowGame.tryShowError(message);
                return;
            }

            const subcommand = args[0].toLowerCase();

            switch (subcommand) {
                case 'month':
                    // Show monthly board in the current channel
                    await this.displayMonthlyLeaderboard(message, shadowGame);
                    // Update pinned monthly board as well
                    await this.updateMonthlyLiveBoard(message.client);
                    break;

                case 'year':
                    // Show yearly board in the current channel
                    await this.displayYearlyLeaderboard(message, shadowGame);
                    // Update pinned yearly board as well
                    await this.updateYearlyLiveBoard(message.client);
                    break;

                case 'highscores':
                    // Show arcade high scores
                    await this.displayHighScores(message, args.slice(1), shadowGame);
                    break;

                case 'refresh':
                    // Force-update both pinned boards
                    await this.updateMonthlyLiveBoard(message.client);
                    await this.updateYearlyLiveBoard(message.client);
                    await message.channel.send('```ansi\n\x1b[32m[Leaderboards have been refreshed]\x1b[0m\n```');
                    break;

                default:
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid option\nUse !leaderboard to see available options\n[Ready for input]█\x1b[0m```');
                    if (shadowGame) await shadowGame.tryShowError(message);
            }
        } catch (error) {
            console.error('[LEADERBOARD] Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to process leaderboard command\n[Ready for input]█\x1b[0m```');
        }
    },

    // ======================================
    // MONTHLY LEADERBOARD (COMMAND)
    // ======================================
    async displayMonthlyLeaderboard(message, shadowGame) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing monthly rankings...\x1b[0m\n```');

            const embed = await this.buildMonthlyEmbed();
            await message.channel.send({ embeds: [embed] });

            if (shadowGame) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('[LEADERBOARD] Monthly Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve monthly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },

    // ======================================
    // YEARLY LEADERBOARD (COMMAND)
    // ======================================
    async displayYearlyLeaderboard(message, shadowGame) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');

            const embed = await this.buildYearlyEmbed();
            await message.channel.send({ embeds: [embed] });

            if (shadowGame) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('[LEADERBOARD] Yearly Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly leaderboard\n[Ready for input]█\x1b[0m```');
        }
    },

    // ======================================
    // BUILD MONTHLY EMBED (COMMON UTILITY)
    // ======================================
    async buildMonthlyEmbed() {
        const leaderboardData = await DataService.getLeaderboard('monthly');
        const currentChallenge = await DataService.getCurrentChallenge();

        // Filter out zero-progress users
        const validUsers = await DataService.getValidUsers();
        const activeUsers = leaderboardData.filter(user =>
            validUsers.includes(user.username.toLowerCase()) &&
            (user.completedAchievements > 0 || parseFloat(user.completionPercentage) > 0)
        );

        const embed = new TerminalEmbed()
            .setTerminalTitle('MONTHLY LEADERBOARD')
            .setThumbnail(`https://retroachievements.org${currentChallenge?.gameIcon || ''}`)
            .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]');

        // Top 3
        const medals = ['🥇', '🥈', '🥉'];
        activeUsers.slice(0, 3).forEach((user, index) => {
            embed.addTerminalField(
                `${medals[index]} ${user.username}`,
                `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\nPROGRESS: ${user.completionPercentage}%`
            );
        });

        // Others
        const additional = activeUsers.slice(3)
            .map(u => `${u.username} (${u.completionPercentage}%)`)
            .join('\n');

        if (additional) {
            embed.addTerminalField('ADDITIONAL PARTICIPANTS', additional);
        }
        if (activeUsers.length === 0) {
            embed.addTerminalField('STATUS', 'No active participants yet');
        }

        embed.setTerminalFooter();
        return embed;
    },

    // ======================================
    // BUILD YEARLY EMBED (COMMON UTILITY)
    // ======================================
    async buildYearlyEmbed() {
        const yearlyLeaderboard = await DataService.getLeaderboard('yearly');
        const validUsers = await DataService.getValidUsers();

        // Filter for valid users with >0 points; sort descending
        const activeUsers = yearlyLeaderboard
            .filter(u => validUsers.includes(u.username.toLowerCase()) && u.points > 0)
            .sort((a, b) => b.points - a.points);

        let currentRank = 1;
        let previousPoints = null;

        // Compute ranks properly
        const ranked = activeUsers.map((user, index) => {
            if (previousPoints !== user.points) {
                currentRank = index + 1;
                previousPoints = user.points;
            }
            return { ...user, rank: currentRank };
        });

        const embed = new TerminalEmbed()
            .setTerminalTitle('YEARLY LEADERBOARD')
            .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

        if (ranked.length > 0) {
            embed.addTerminalField('TOP USERS',
                ranked
                    .map(u => `${u.rank}. ${u.username}: ${u.points} points`)
                    .join('\n')
            );
        } else {
            embed.addTerminalField('STATUS', 'No rankings available');
        }

        embed.setTerminalFooter();
        return embed;
    },

    // ======================================
    // UPDATE PINNED MONTHLY BOARD
    // ======================================
    async updateMonthlyLiveBoard(client) {
        try {
            const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID);
            const pinnedMessage = await channel.messages.fetch(MONTHLY_MESSAGE_ID);

            const embed = await this.buildMonthlyEmbed();
            await pinnedMessage.edit({
                content: '📅 **Monthly Leaderboard**',
                embeds: [embed]
            });

            console.log('[LEADERBOARD] Updated monthly pinned message.');
        } catch (error) {
            console.error('[LEADERBOARD] Failed to update monthly live board:', error);
        }
    },

    // ======================================
    // UPDATE PINNED YEARLY BOARD
    // ======================================
    async updateYearlyLiveBoard(client) {
        try {
            const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID);
            const pinnedMessage = await channel.messages.fetch(YEARLY_MESSAGE_ID);

            const embed = await this.buildYearlyEmbed();
            await pinnedMessage.edit({
                content: '📆 **Yearly Leaderboard**',
                embeds: [embed]
            });

            console.log('[LEADERBOARD] Updated yearly pinned message.');
        } catch (error) {
            console.error('[LEADERBOARD] Failed to update yearly live board:', error);
        }
    },

    // ======================================
    // DISPLAY HIGHSCORES (COMMAND)
    // ======================================
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
                            .join('\n') + '\n\n✓ = Scores recorded'
                    )
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
                            return `${medals[index] || ''} ${score.username}: ${score.score.toLocaleString()}`;
                        })
                        .join('\n'));
            } else {
                embed.addTerminalField('STATUS', 'No scores recorded yet');
            }

            if (gameData.boxArt) {
                embed.setImage(gameData.boxArt);
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            if (shadowGame) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('[LEADERBOARD] High Scores Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve high scores\n[Ready for input]█\x1b[0m```');
        }
    },

    // ======================================
    // AUTOMATIC REFRESH INITIALIZATION
    // ======================================
    // Call this ONCE when the bot starts (e.g., in your index.js)
    async initializeLiveLeaderboards(client) {
        if (this.isLeaderboardInitialized) {
            console.log('[LEADERBOARD] Live board updates already initialized.');
            return;
        }

        // Immediately update pinned boards on startup
        await this.updateMonthlyLiveBoard(client);
        await this.updateYearlyLiveBoard(client);

        // Refresh both boards every 5 minutes
        setInterval(async () => {
            await this.updateMonthlyLiveBoard(client);
            await this.updateYearlyLiveBoard(client);
        }, 5 * 60 * 1000); // 5 minutes = 300000 ms

        this.isLeaderboardInitialized = true;
        console.log('[LEADERBOARD] Automatic leaderboard updates started (every 5 minutes).');
    }
};

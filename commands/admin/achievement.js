// commands/admin/achievement.js
const TerminalEmbed = require('../../utils/embedBuilder');
const raAPI = require('../../raAPI');
const DataService = require('../../services/dataService');

module.exports = {
    name: 'achievement',
    description: 'Manage achievement system',
    async execute(message, args, { achievementSystem }) {
        try {
            if (!args.length) {
                return await showHelp(message);
            }

            const [subcommand, ...subArgs] = args;

            switch(subcommand.toLowerCase()) {
                case 'recheck':
                    await handleRecheck(message, subArgs, achievementSystem);
                    break;
                case 'sync':
                    await handleSync(message, achievementSystem);
                    break;
                case 'status':
                    await handleStatus(message, achievementSystem);
                    break;
                default:
                    await showHelp(message);
            }
        } catch (error) {
            console.error('Achievement Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Achievement operation failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

async function showHelp(message) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('ACHIEVEMENT MANAGEMENT')
        .setTerminalDescription('[COMMAND USAGE]')
        .addTerminalField('AVAILABLE COMMANDS',
            '!achievement recheck <username> - Recheck user achievements\n' +
            '!achievement recheck all - Recheck all users\n' +
            '!achievement sync - Sync achievement records with RetroAchievements\n' +
            '!achievement status - View achievement system status')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleRecheck(message, args, achievementSystem) {
    if (!args.length) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Username required\nUsage: !achievement recheck <username> or !achievement recheck all\n[Ready for input]█\x1b[0m```');
        return;
    }

    const statusEmbed = new TerminalEmbed()
        .setTerminalTitle('ACHIEVEMENT RECHECK')
        .setTerminalDescription('[PROCESSING]');
    
    const statusMessage = await message.channel.send({ embeds: [statusEmbed] });

    try {
        const validUsers = await DataService.getValidUsers();
        const usersToCheck = args[0].toLowerCase() === 'all' 
            ? validUsers 
            : [args[0].toLowerCase()];

        if (!usersToCheck.every(user => validUsers.includes(user))) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid username\n[Ready for input]█\x1b[0m```');
            return;
        }

        // Get all game IDs from achievement system
        const gameIds = Object.keys(achievementSystem.constructor.Games);
        
        // Fetch historical progress
        const progressData = await raAPI.fetchHistoricalProgress(usersToCheck, gameIds);

        const results = {
            processed: 0,
            achievementsFound: 0,
            errors: []
        };

        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        for (const username of usersToCheck) {
            try {
                statusEmbed.addTerminalField('STATUS',
                    `Processing ${username} (${results.processed + 1}/${usersToCheck.length})`
                );
                await statusMessage.edit({ embeds: [statusEmbed] });

                const userProgress = progressData.get(username);
                if (!userProgress) {
                    results.errors.push({ username, error: 'No achievement data found' });
                    continue;
                }

                for (const [gameId, achievements] of userProgress.entries()) {
                    await achievementSystem.checkAchievements(
                        username,
                        achievements,
                        gameId,
                        currentMonth,
                        currentYear
                    );
                    results.achievementsFound += achievements.length;
                }

                results.processed++;
            } catch (error) {
                console.error(`Error processing ${username}:`, error);
                results.errors.push({ username, error: error.message });
            }
        }

        // Update status message with results
        statusEmbed
            .setTerminalDescription('[RECHECK COMPLETE]')
            .addTerminalField('RESULTS',
                `Users Processed: ${results.processed}\n` +
                `Achievements Checked: ${results.achievementsFound}`
            );

        if (results.errors.length > 0) {
            statusEmbed.addTerminalField('ERRORS',
                results.errors.map(e => `${e.username}: ${e.error}`).join('\n')
            );
        }

        statusEmbed.setTerminalFooter();
        await statusMessage.edit({ embeds: [statusEmbed] });

        // Force leaderboard update
        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }

    } catch (error) {
        console.error('Achievement recheck error:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to recheck achievements\n[Ready for input]█\x1b[0m```');
    }
}

async function handleSync(message, achievementSystem) {
    const statusEmbed = new TerminalEmbed()
        .setTerminalTitle('ACHIEVEMENT SYNC')
        .setTerminalDescription('[PROCESSING]')
        .addTerminalField('STATUS', 'Starting achievement sync...');
    
    const statusMessage = await message.channel.send({ embeds: [statusEmbed] });

    try {
        const gameIds = Object.keys(achievementSystem.constructor.Games);
        const validUsers = await DataService.getValidUsers();

        // Pause achievement feed during sync
        if (global.achievementFeed) {
            global.achievementFeed.isPaused = true;
        }

        const results = {
            usersProcessed: 0,
            achievementsChecked: 0,
            errors: []
        };

        for (const username of validUsers) {
            try {
                await handleRecheck(message, [username], achievementSystem);
                results.usersProcessed++;
            } catch (error) {
                results.errors.push({ username, error: error.message });
            }
        }

        // Resume achievement feed
        if (global.achievementFeed) {
            global.achievementFeed.isPaused = false;
        }

        statusEmbed
            .setTerminalDescription('[SYNC COMPLETE]')
            .addTerminalField('RESULTS',
                `Users Processed: ${results.usersProcessed}\n` +
                `Achievement Feed: Resumed`
            );

        if (results.errors.length > 0) {
            statusEmbed.addTerminalField('ERRORS',
                results.errors.map(e => `${e.username}: ${e.error}`).join('\n')
            );
        }

        statusEmbed.setTerminalFooter();
        await statusMessage.edit({ embeds: [statusEmbed] });

    } catch (error) {
        console.error('Achievement sync error:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to sync achievements\n[Ready for input]█\x1b[0m```');
        
        // Ensure achievement feed is resumed
        if (global.achievementFeed) {
            global.achievementFeed.isPaused = false;
        }
    }
}

async function handleStatus(message, achievementSystem) {
    try {
        const validUsers = await DataService.getValidUsers();
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // Get achievement stats
        const monthlyAchievements = await achievementSystem.database.getMonthlyAchievements(
            currentMonth,
            currentYear
        );

        const stats = {
            totalUsers: validUsers.length,
            activeUsers: new Set(monthlyAchievements.map(a => a.username)).size,
            totalAchievements: monthlyAchievements.length,
            gameBreakdown: {}
        };

        // Group achievements by game
        for (const achievement of monthlyAchievements) {
            if (!stats.gameBreakdown[achievement.gameId]) {
                stats.gameBreakdown[achievement.gameId] = {
                    name: achievementSystem.constructor.Games[achievement.gameId]?.name || 'Unknown Game',
                    achievements: 0,
                    users: new Set()
                };
            }
            stats.gameBreakdown[achievement.gameId].achievements++;
            stats.gameBreakdown[achievement.gameId].users.add(achievement.username);
        }

        const embed = new TerminalEmbed()
            .setTerminalTitle('ACHIEVEMENT SYSTEM STATUS')
            .setTerminalDescription('[STATUS REPORT]')
            .addTerminalField('GENERAL STATS',
                `Total Users: ${stats.totalUsers}\n` +
                `Active Users This Month: ${stats.activeUsers}\n` +
                `Total Achievements Earned: ${stats.totalAchievements}`
            );

        // Add game-specific stats
        for (const [gameId, game] of Object.entries(stats.gameBreakdown)) {
            embed.addTerminalField(game.name,
                `Achievements Earned: ${game.achievements}\n` +
                `Active Users: ${game.users.size}`
            );
        }

        embed.setTerminalFooter();
        await message.channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Achievement status error:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to get achievement status\n[Ready for input]█\x1b[0m```');
    }
}

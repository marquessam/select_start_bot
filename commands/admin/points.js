// commands/admin/points.js
const TerminalEmbed = require('../../utils/embedBuilder');
const DataService = require('../../services/dataService');

module.exports = {
    name: 'points',
    description: 'Manage user points system',
    async execute(message, args, services) {
        try {
            const { pointsManager } = services;
            if (!pointsManager) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Points system unavailable\n[Ready for input]█\x1b[0m```');
                return;
            }

            if (!args.length) {
                return await showHelp(message);
            }

            const [subcommand, ...subArgs] = args;

            switch (subcommand.toLowerCase()) {
                case 'add':
                    await handleAddPoints(message, subArgs, pointsManager);
                    break;
                case 'remove':
                    await handleRemovePoints(message, subArgs, pointsManager);
                    break;
                case 'recheck':
                    await handleRecheckPoints(message, services);
                    break;
                case 'cleanup':
                    await handleCleanupPoints(message, pointsManager);
                    break;
                default:
                    await showHelp(message);
            }
        } catch (error) {
            console.error('Points Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Points operation failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

async function showHelp(message) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('POINTS MANAGEMENT')
        .setTerminalDescription('[COMMAND USAGE]')
        .addTerminalField('AVAILABLE COMMANDS',
            '!points add <username> <points> <reason> - Add points\n' +
            '!points remove <username> <points> <reason> - Remove points\n' +
            '!points recheck <username> - Recheck achievements for points')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleAddPoints(message, args, pointsManager) {
    if (args.length < 3) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !points add <username> <points> <reason>\n[Ready for input]█\x1b[0m```');
        return;
    }

    const [username, pointsStr, ...reasonArr] = args;
    const points = parseInt(pointsStr);
    const reason = reasonArr.join(' ');

    if (isNaN(points)) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
        return;
    }

    const validUsers = await DataService.getValidUsers();
    if (!validUsers.includes(username.toLowerCase())) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] User not found\n[Ready for input]█\x1b[0m```');
        return;
    }

    const success = await pointsManager.awardPoints(username, points, reason);
    if (success) {
        const embed = new TerminalEmbed()
            .setTerminalTitle('POINTS AWARDED')
            .setTerminalDescription('[UPDATE SUCCESSFUL]')
            .addTerminalField('DETAILS', 
                `USER: ${username}\n` +
                `POINTS: ${points}\n` +
                `REASON: ${reason}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }
    } else {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to award points\n[Ready for input]█\x1b[0m```');
    }
}
    async function handleCleanupPoints(message, pointsManager) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Starting points cleanup...\x1b[0m\n```');
        
            const removedCount = await pointsManager.cleanupDuplicatePoints();
        
            const embed = new TerminalEmbed()
                .setTerminalTitle('POINTS CLEANUP COMPLETE')
                .setTerminalDescription('[DATABASE UPDATE SUCCESSFUL]')
                .addTerminalField('RESULTS',
                    `Removed ${removedCount} duplicate points\n` +
                    'Leaderboard has been updated')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Points cleanup error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to cleanup points\n[Ready for input]█\x1b[0m```');
        }
    }
async function handleRemovePoints(message, args, pointsManager) {
    if (args.length < 3) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !points remove <username> <points> <reason>\n[Ready for input]█\x1b[0m```');
        return;
    }

    const [username, pointsStr, ...reasonArr] = args;
    const points = parseInt(pointsStr);
    const reason = reasonArr.join(' ');

    if (isNaN(points)) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
        return;
    }

    // Remove points by awarding negative points
    const success = await pointsManager.awardPoints(username, -Math.abs(points), reason);
    if (success) {
        const embed = new TerminalEmbed()
            .setTerminalTitle('POINTS REMOVED')
            .setTerminalDescription('[UPDATE SUCCESSFUL]')
            .addTerminalField('DETAILS', 
                `USER: ${username}\n` +
                `POINTS REMOVED: ${points}\n` +
                `REASON: ${reason}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }
    } else {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to remove points\n[Ready for input]█\x1b[0m```');
    }
}

async function handleRecheckPoints(message, services) {
    const { userStats } = services;
    if (!userStats) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] User stats service unavailable\n[Ready for input]█\x1b[0m```');
        return;
    }

    await message.channel.send('```ansi\n\x1b[32m> Rechecking points...\x1b[0m\n```');

    try {
        const result = await userStats.recheckAllPoints(message.guild);
        
        const embed = new TerminalEmbed()
            .setTerminalTitle('POINTS RECHECK COMPLETE')
            .setTerminalDescription('[UPDATE SUCCESSFUL]')
            .addTerminalField('RESULTS', 
                `Processed Users: ${result.processed.length}\n` +
                `Errors: ${result.errors.length}`)
            .setTerminalFooter();

        if (result.errors.length > 0) {
            embed.addTerminalField('ERRORS',
                result.errors.map(e => `${e.username}: ${e.error}`).join('\n'));
        }

        await message.channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Points recheck error:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to recheck points\n[Ready for input]█\x1b[0m```');
    }
}

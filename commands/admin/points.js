// commands/admin/points.js
const TerminalEmbed = require('../../utils/embedBuilder');
const DataService = require('../../services/dataService');

module.exports = {
    name: 'points',
    description: 'Manage user points system',
    async execute(message, args, services) {
        try {
            const userStats = services?.userStats;
            if (!userStats) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Points system unavailable\n[Ready for input]█\x1b[0m```');
                return;
            }

            if (!args.length) {
                return await showHelp(message);
            }

            const [subcommand, ...subArgs] = args;

            switch (subcommand.toLowerCase()) {
                case 'add':
                    await handleAddPoints(message, subArgs, userStats);
                    break;
                case 'reset':
                    await handleResetPoints(message, subArgs, userStats);
                    break;
                case 'resetall':
                    await handleResetAllPoints(message, userStats);
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
            '!points add <username> <points> <reason> - Add/remove points\n' +
            '!points reset <username> - Reset user points\n' +
            '!points resetall - Reset all points')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleAddPoints(message, args, userStats) {
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

    try {
        const success = await userStats.addBonusPoints(username, points, reason);
        if (success) {
            const embed = new TerminalEmbed()
                .setTerminalTitle('POINTS ADDED')
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
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to add points (possible duplicate)\n[Ready for input]█\x1b[0m```');
        }
    } catch (error) {
        console.error('Error adding points:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to add points\n[Ready for input]█\x1b[0m```');
    }
}

async function handleResetPoints(message, args, userStats) {
    if (args.length !== 1) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !points reset <username>\n[Ready for input]█\x1b[0m```');
        return;
    }

    const username = args[0];
    
    try {
        await userStats.resetUserPoints(username);
        
        const embed = new TerminalEmbed()
            .setTerminalTitle('POINTS RESET')
            .setTerminalDescription('[UPDATE SUCCESSFUL]')
            .addTerminalField('DETAILS', `Reset points for: ${username}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }
    } catch (error) {
        console.error('Error resetting points:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reset points\n[Ready for input]█\x1b[0m```');
    }
}

async function handleResetAllPoints(message, userStats) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('CONFIRM RESET ALL')
        .setTerminalDescription('[WARNING]')
        .addTerminalField('CAUTION', 'This will reset ALL user points\nType "CONFIRM" to proceed')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });

    try {
        const filter = m => m.author.id === message.author.id;
        const collected = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000
        });

        if (collected.first().content === 'CONFIRM') {
            await userStats.resetAllPoints();
            
            await message.channel.send('```ansi\n\x1b[32m[SUCCESS] All points have been reset\n[Ready for input]█\x1b[0m```');

            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }
        } else {
            await message.channel.send('```ansi\n\x1b[32m[NOTICE] Reset cancelled\n[Ready for input]█\x1b[0m```');
        }
    } catch (error) {
        console.error('Error resetting all points:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reset points\n[Ready for input]█\x1b[0m```');
    }
}

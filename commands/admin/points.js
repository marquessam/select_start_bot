import TerminalEmbed = require('../../utils/embedBuilder.js');

export default = {
    name: 'points',
    description: 'Manage user points system',
    async execute(message, args, { userStats }) {
        try {
            if (!args.length) {
                return await showHelp(message);
            }

            const [subcommand, ...subArgs] = args;

            switch(subcommand) {
                case 'add':
                    await handleAddPoints(message, subArgs, userStats);
                    break;
                case 'addmulti':
                    await handleAddMultiPoints(message, subArgs, userStats);
                    break;
                case 'addall':
                    await handleAddAllPoints(message, subArgs, userStats);
                    break;
                case 'reset':
                    await handleResetPoints(message, subArgs, userStats);
                    break;
                case 'restore':
                    await handleRestorePoints(message, userStats);
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
            '!points add <user> <points> <reason>\n' +
            '!points addmulti <points> <reason> <user1> <user2> ...\n' +
            '!points addall <points> <reason>\n' +
            '!points reset <username>\n' +
            '!points restore')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleAddPoints(message, args, userStats) {
    if (args.length < 3) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !points add <username> <points> <reason>\n[Ready for input]█\x1b[0m```');
        return;
    }

    const username = args[0].toLowerCase();
    const points = parseInt(args[1]);
    const reason = args.slice(2).join(' ');

    if (isNaN(points)) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
        return;
    }

    try {
        const validUsers = await userStats.getAllUsers();
        if (!validUsers.includes(username)) {
            await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" not found\n[Ready for input]█\x1b[0m\`\`\``);
            return;
        }

        // Get initial state and force cache refresh
        await userStats.refreshCache();
        const beforeStats = await userStats.getUserStats(username);
        const currentYear = new Date().getFullYear().toString();
        const pointsBefore = beforeStats.yearlyPoints[currentYear] || 0;

        // Add points and force save
        await userStats.addBonusPoints(username, points, reason);
        await userStats.saveStats();

        // Verify the update with fresh cache
        await userStats.refreshCache();
        const afterStats = await userStats.getUserStats(username);
        const pointsAfter = afterStats.yearlyPoints[currentYear] || 0;

        // Force leaderboard update
        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }

        const embed = new TerminalEmbed()
            .setTerminalTitle('POINTS ALLOCATED')
            .setTerminalDescription('[TRANSACTION COMPLETE]')
            .addTerminalField('OPERATION DETAILS', 
                `USER: ${username}\n` +
                `POINTS: ${points}\n` +
                `REASON: ${reason}`)
            .addTerminalField('VERIFICATION',
                `POINTS BEFORE: ${pointsBefore}\n` +
                `POINTS AFTER: ${pointsAfter}\n` +
                `CHANGE: ${points}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in handleAddPoints:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to add points\n[Ready for input]█\x1b[0m```');
    }
}

async function handleAddMultiPoints(message, args, userStats) {
    if (args.length < 4) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !points addmulti <points> <reason> <user1> <user2> ...\n[Ready for input]█\x1b[0m```');
        return;
    }

    const points = parseInt(args[0]);
    const reason = args[1];
    const userList = args.slice(2);

    if (isNaN(points)) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
        return;
    }

    try {
        // Force cache refresh before starting
        await userStats.refreshCache();
        const validUsers = await userStats.getAllUsers();
        const invalidUsers = userList.filter(user => !validUsers.includes(user.toLowerCase()));
        
        if (invalidUsers.length > 0) {
            await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] Invalid users: ${invalidUsers.join(', ')}\n[Ready for input]█\x1b[0m\`\`\``);
            return;
        }

        let successfulAdditions = [];
        let failedUsers = [];

        // Process each user and force save after each
        for (const username of userList) {
            try {
                await userStats.addBonusPoints(username, points, reason);
                await userStats.saveStats();
                successfulAdditions.push(username);
            } catch (error) {
                console.error(`Error adding points to ${username}:`, error);
                failedUsers.push(username);
            }
        }

        // Force final cache refresh and leaderboard update
        await userStats.refreshCache();
        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }

        const embed = new TerminalEmbed()
            .setTerminalTitle('MULTI-USER POINTS ALLOCATION')
            .setTerminalDescription('[TRANSACTION COMPLETE]')
            .addTerminalField('OPERATION DETAILS', 
                `USERS AFFECTED: ${successfulAdditions.length}/${userList.length}\n` +
                `POINTS PER USER: ${points}\n` +
                `REASON: ${reason}`);

        if (failedUsers.length > 0) {
            embed.addTerminalField('FAILED ALLOCATIONS',
                failedUsers.join(', '));
        }

        embed.setTerminalFooter();
        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in handleAddMultiPoints:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to add points\n[Ready for input]█\x1b[0m```');
    }
}

async function handleAddAllPoints(message, args, userStats) {
    if (args.length < 2) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !points addall <points> <reason>\n[Ready for input]█\x1b[0m```');
        return;
    }

    const points = parseInt(args[0]);
    const reason = args.slice(1).join(' ');

    if (isNaN(points)) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
        return;
    }

    try {
        // Force cache refresh before starting
        await userStats.refreshCache();
        const users = await userStats.getAllUsers();
        let successfulAdditions = 0;
        let failedUsers = [];

        // Process all users
        for (const username of users) {
            try {
                await userStats.addBonusPoints(username, points, reason);
                await userStats.saveStats();
                successfulAdditions++;
            } catch (error) {
                console.error(`Error adding points to ${username}:`, error);
                failedUsers.push(username);
            }
        }

        // Force final cache refresh and leaderboard update
        await userStats.refreshCache();
        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }

        const embed = new TerminalEmbed()
            .setTerminalTitle('MASS POINTS ALLOCATION')
            .setTerminalDescription('[TRANSACTION COMPLETE]')
            .addTerminalField('OPERATION DETAILS', 
                `USERS AFFECTED: ${successfulAdditions}/${users.length}\n` +
                `POINTS PER USER: ${points}\n` +
                `REASON: ${reason}`);

        if (failedUsers.length > 0) {
            embed.addTerminalField('FAILED ALLOCATIONS',
                failedUsers.join(', '));
        }

        embed.setTerminalFooter();
        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in handleAddAllPoints:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to add points\n[Ready for input]█\x1b[0m```');
    }
}

async function handleResetPoints(message, args, userStats) {
    if (args.length !== 1) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !points reset <username>\n[Ready for input]█\x1b[0m```');
        return;
    }

    const username = args[0].toLowerCase();
    
    try {
        // Force cache refresh and get initial state
        await userStats.refreshCache();
        const beforeStats = await userStats.getUserStats(username);
        if (!beforeStats) {
            await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" not found\n[Ready for input]█\x1b[0m\`\`\``);
            return;
        }

        const currentYear = new Date().getFullYear().toString();
        const pointsBeforeReset = beforeStats.yearlyPoints[currentYear] || 0;

        // Reset points and force save
        await userStats.resetUserPoints(username);
        await userStats.saveStats();

        // Verify reset with fresh cache
        await userStats.refreshCache();
        const afterStats = await userStats.getUserStats(username);
        const pointsAfterReset = afterStats.yearlyPoints[currentYear] || 0;

        // Force leaderboard update
        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }

        const embed = new TerminalEmbed()
            .setTerminalTitle('POINTS RESET')
            .setTerminalDescription('[OPERATION COMPLETE]')
            .addTerminalField('RESET DETAILS', 
                `USER: ${username}\n` +
                `POINTS BEFORE RESET: ${pointsBeforeReset}\n` +
                `POINTS AFTER RESET: ${pointsAfterReset}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in handleResetPoints:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reset points\n[Ready for input]█\x1b[0m```');
    }
}

async function handleRestorePoints(message, userStats) {
    const betaRoleId = '1301710526535041105';
    const betaRole = message.guild.roles.cache.get(betaRoleId);
    
    if (!betaRole) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Beta role not found\n[Ready for input]█\x1b[0m```');
        return;
    }

    try {
        // Force cache refresh before starting
        await userStats.refreshCache();
        const betaMembers = betaRole.members;
        const processedUsers = [];
        const failedUsers = [];

        for (const [memberId, member] of betaMembers) {
            try {
                const username = member.nickname || member.user.username;
                await userStats.addBonusPoints(username, 1, 'Beta Program Participation');
                await userStats.saveStats();
                processedUsers.push(username);
            } catch (error) {
                console.error(`Error processing user ${member.user.username}:`, error);
                failedUsers.push(member.user.username);
            }
        }

        // Force final cache refresh and leaderboard update
        await userStats.refreshCache();
        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }

        const embed = new TerminalEmbed()
            .setTerminalTitle('BETA POINTS RESTORATION')
            .setTerminalDescription('[PROCESS COMPLETE]')
            .addTerminalField('SUMMARY', 
                `Successfully processed: ${processedUsers.length}\n` +
                `Failed to process: ${failedUsers.length}`);

        if (processedUsers.length > 0) {
            embed.addTerminalField('POINTS RESTORED TO', processedUsers.join('\n'));
        }
        if (failedUsers.length > 0) {
            embed.addTerminalField('FAILED TO PROCESS', failedUsers.join('\n'));
        }

        embed.setTerminalFooter();
        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in handleRestorePoints:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to restore points\n[Ready for input]█\x1b[0m```');
    }
}

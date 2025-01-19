const TerminalEmbed = require('../../utils/embedBuilder');
const { commonValidators } = require('../../utils/validators');
const { Collection } = require('discord.js');

// Track active point assignments
const activeCollectors = new Collection();

module.exports = {
    name: 'points',
    description: 'Manage user points system',
    async execute(message, args, services) {
        try {
            const userStats = services?.userStats;
            if (!userStats) {
                console.error('Points Command: userStats service not available');
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Points system unavailable\n[Ready for input]█\x1b[0m```');
                return;
            }

            if (!args.length) {
                return await showHelp(message);
            }

            const [subcommand, ...subArgs] = args;

            // Check if there's already an active collector for this user
            if (activeCollectors.has(message.author.id)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] You already have an active points command running\n[Ready for input]█\x1b[0m```');
                return;
            }

            switch(subcommand.toLowerCase()) {
                case 'add':
                    await startPointsAdd(message, userStats);
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
            '!points add - Start interactive point assignment\n' +
            '!points addmulti <points> <reason> <user1> <user2> ...\n' +
            '!points addall <points> <reason>\n' +
            '!points reset <username>')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function startPointsAdd(message, userStats) {
    const filter = m => m.author.id === message.author.id;
    let username, points, reason;

    // Create collector for this user
    activeCollectors.set(message.author.id, true);

    try {
        // Step 1: Get username
        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the username:\n[Ready for input]█\x1b[0m```');
        const usernameResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
        });
        username = usernameResponse.first().content.trim();

        // Validate username
        if (!commonValidators.username(username)) {
            throw new Error('Invalid username format');
        }

        const validUsers = await userStats.getAllUsers();
        if (!validUsers.includes(username.toLowerCase())) {
            throw new Error(`User "${username}" not found`);
        }

        // Step 2: Get points
        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the point amount (-100 to 100):\n[Ready for input]█\x1b[0m```');
        const pointsResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
        });
        points = parseInt(pointsResponse.first().content);

        // Validate points
        if (!commonValidators.points(points)) {
            throw new Error('Invalid points value (must be between -100 and 100)');
        }

        // Step 3: Get reason
        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the reason for points:\n[Ready for input]█\x1b[0m```');
        const reasonResponse = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
        });
        reason = reasonResponse.first().content;

        // Validate reason
        if (!commonValidators.reason(reason)) {
            throw new Error('Invalid reason (must be 3-200 characters)');
        }

        // Get initial state and force cache refresh
        await userStats.refreshCache();
        const beforeStats = await userStats.getUserStats(username);
        const currentYear = new Date().getFullYear().toString();
        const pointsBefore = beforeStats?.yearlyPoints?.[currentYear] || 0;

        // Add points and force save
        await userStats.addBonusPoints(username, points, reason);
        await userStats.saveStats();

        // Verify the update with fresh cache
        await userStats.refreshCache();
        const afterStats = await userStats.getUserStats(username);
        const pointsAfter = afterStats?.yearlyPoints?.[currentYear] || 0;

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
        if (error.message === 'time') {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Command timed out\n[Ready for input]█\x1b[0m```');
        } else {
            await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] ${error.message}\n[Ready for input]█\x1b[0m\`\`\``);
        }
    } finally {
        // Clean up collector
        activeCollectors.delete(message.author.id);
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

    if (!commonValidators.points(points)) {
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

        if (successfulAdditions.length > 0) {
            embed.addTerminalField('SUCCESSFUL ALLOCATIONS', successfulAdditions.join('\n'));
        }

        if (failedUsers.length > 0) {
            embed.addTerminalField('FAILED ALLOCATIONS', failedUsers.join('\n'));
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

    if (!commonValidators.points(points)) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
        return;
    }

    try {
        // Force cache refresh before starting
        await userStats.refreshCache();
        const users = await userStats.getAllUsers();
        let successfulAdditions = 0;
        let failedUsers = [];

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
            embed.addTerminalField('FAILED ALLOCATIONS', failedUsers.join('\n'));
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

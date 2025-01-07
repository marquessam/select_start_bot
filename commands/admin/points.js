const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
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

    const validUsers = await userStats.getAllUsers();
    if (!validUsers.includes(username)) {
        await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" not found\n[Ready for input]█\x1b[0m\`\`\``);
        return;
    }

    const beforeStats = await userStats.getUserStats(username);
    const currentYear = new Date().getFullYear().toString();
    const pointsBefore = beforeStats.yearlyPoints[currentYear] || 0;

    await userStats.addBonusPoints(username, points, reason);

    const afterStats = await userStats.getUserStats(username);
    const pointsAfter = afterStats.yearlyPoints[currentYear] || 0;

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

    const validUsers = await userStats.getAllUsers();
    const invalidUsers = userList.filter(user => !validUsers.includes(user.toLowerCase()));
    
    if (invalidUsers.length > 0) {
        await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] Invalid users: ${invalidUsers.join(', ')}\n[Ready for input]█\x1b[0m\`\`\``);
        return;
    }

    let successfulAdditions = [];
    let failedUsers = [];
    const currentYear = new Date().getFullYear().toString();

    // Process each user
    for (const username of userList) {
        try {
            await userStats.addBonusPoints(username, points, reason);
            successfulAdditions.push(username);
        } catch (error) {
            console.error(`Error adding points to ${username}:`, error);
            failedUsers.push(username);
        }
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

    const users = await userStats.getAllUsers();
    let successfulAdditions = 0;
    let failedUsers = [];

    for (const username of users) {
        try {
            await userStats.addBonusPoints(username, points, reason);
            successfulAdditions++;
        } catch (error) {
            console.error(`Error adding points to ${username}:`, error);
            failedUsers.push(username);
        }
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
}

async function handleResetPoints(message, args, userStats) {
    if (args.length !== 1) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !points reset <username>\n[Ready for input]█\x1b[0m```');
        return;
    }

    const username = args[0].toLowerCase();
    const currentYear = new Date().getFullYear().toString();

    const beforeStats = await userStats.getUserStats(username);
    if (!beforeStats) {
        await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" not found\n[Ready for input]█\x1b[0m\`\`\``);
        return;
    }

    const pointsBeforeReset = beforeStats.yearlyPoints[currentYear] || 0;
    await userStats.resetUserPoints(username);

    const afterStats = await userStats.getUserStats(username);
    const pointsAfterReset = afterStats.yearlyPoints[currentYear] || 0;

    const embed = new TerminalEmbed()
        .setTerminalTitle('POINTS RESET')
        .setTerminalDescription('[OPERATION COMPLETE]')
        .addTerminalField('RESET DETAILS', 
            `USER: ${username}\n` +
            `POINTS BEFORE RESET: ${pointsBeforeReset}\n` +
            `POINTS AFTER RESET: ${pointsAfterReset}`)
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleRestorePoints(message, userStats) {
    const betaRoleId = '1301710526535041105';
    const betaRole = message.guild.roles.cache.get(betaRoleId);
    
    if (!betaRole) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Beta role not found\n[Ready for input]█\x1b[0m```');
        return;
    }

    const betaMembers = betaRole.members;
    const processedUsers = [];
    const failedUsers = [];

    for (const [memberId, member] of betaMembers) {
        try {
            const username = member.nickname || member.user.username;
            await userStats.addBonusPoints(username, 1, 'Beta Program Participation');
            processedUsers.push(username);
        } catch (error) {
            console.error(`Error processing user ${member.user.username}:`, error);
            failedUsers.push(member.user.username);
        }
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
}

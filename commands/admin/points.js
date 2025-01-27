// commands/admin/points.js

const { Collection } = require('discord.js');
const TerminalEmbed = require('../../utils/embedBuilder');
const commonValidators = require('../../utils/validators');
const DataService = require('../../services/dataService');
const { ErrorHandler } = require('../../utils/errorHandler');

// Track active point assignments
const activeCollectors = new Collection();

module.exports = {
    name: 'points',
    description: 'Manage user points system',
    async execute(message, args, services) {
        try {
            // Verify userStats service is available
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

            switch (subcommand.toLowerCase()) {
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
                case 'resetall':
                    await handleResetAllPoints(message, userStats);
                    break;
                case 'recheck':
                    await handleRecheckPoints(message, userStats);
                    break;
                case 'cleanup':
                    await handleCleanupPoints(message, userStats);
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
            '!points reset <username>\n' +
            '!points resetall - Reset all user points\n' +
            '!points recheck - Recheck all achievement points\n' +
            '!points cleanup - Remove duplicate point entries')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function validateUsername(username, userStats) {
    const cleanUsername = username.trim().toLowerCase();
    const validUsers = await DataService.getValidUsers();
    
    if (!validUsers.includes(cleanUsername)) {
        return null;
    }

    // Ensure user stats are initialized
    if (userStats) {
        await userStats.initializeUserIfNeeded(cleanUsername);
    }

    return cleanUsername;
}

async function startPointsAdd(message, userStats) {
    const filter = m => m.author.id === message.author.id && m.channel.id === message.channel.id;
    let username, points, reason;

    // Create collector for this user
    activeCollectors.set(message.author.id, true);

    try {
        // Step 1: Get username
        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the username:\n[Ready for input]█\x1b[0m```');
        const usernameMsgs = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
        });

        const usernameMsg = usernameMsgs.first();
        if (!usernameMsg) {
            throw new Error('No response received');
        }

        const validatedUsername = await validateUsername(usernameMsg.content, userStats);
        if (!validatedUsername) {
            throw new Error(`User "${usernameMsg.content}" not found`);
        }
        username = validatedUsername;

        // Step 2: Get points
        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the point amount (-100 to 100):\n[Ready for input]█\x1b[0m```');
        const pointsMsgs = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
        });

        const pointsMsg = pointsMsgs.first();
        if (!pointsMsg) {
            throw new Error('No response received');
        }
        points = parseInt(pointsMsg.content);

        if (!commonValidators.points(points)) {
            throw new Error('Invalid points value (must be between -100 and 100)');
        }

        // Step 3: Get reason
        await message.channel.send('```ansi\n\x1b[32m[INPUT REQUIRED] Enter the reason for points:\n[Ready for input]█\x1b[0m```');
        const reasonMsgs = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
        });

        const reasonMsg = reasonMsgs.first();
        if (!reasonMsg) {
            throw new Error('No response received');
        }
        reason = reasonMsg.content;

        if (!commonValidators.reason(reason)) {
            throw new Error('Invalid reason (must be 3-200 characters)');
        }

        // Final confirmation
        const confirmEmbed = new TerminalEmbed()
            .setTerminalTitle('CONFIRM POINTS')
            .setTerminalDescription('[REVIEW DETAILS]')
            .addTerminalField('POINTS ALLOCATION', 
                `USER: ${username}\n` +
                `POINTS: ${points}\n` +
                `REASON: ${reason}`)
            .addTerminalField(
                'INSTRUCTIONS',
                'Type "confirm" to proceed or "cancel"/"abort" to abort'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [confirmEmbed] });

        const confirmMsgs = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
        });

        const confirmMsg = confirmMsgs.first();
        if (!confirmMsg) {
            throw new Error('No response received to final confirmation');
        }

        const userInput = confirmMsg.content.toLowerCase().trim();
        if (userInput === 'confirm') {
            // Proceed with awarding points
            const userStatsData = await DataService.getUserStats(username);
            const currentYear = new Date().getFullYear().toString();
            const pointsBefore = userStatsData?.yearlyPoints?.[currentYear] || 0;

            // Add points and force save
            const success = await userStats.addBonusPoints(username, points, reason);
            
            if (!success) {
                throw new Error(`Failed to add points - possible duplicate award for reason: ${reason}`);
            }

            await userStats.saveStats();

            // Verify the update
            const afterStatsData = await DataService.getUserStats(username);
            const pointsAfter = afterStatsData?.yearlyPoints?.[currentYear] || 0;

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
        } else if (userInput === 'cancel' || userInput === 'abort') {
            throw new Error('Points allocation cancelled by user');
        } else {
            throw new Error(
                `Unrecognized response "${confirmMsg.content}". Please type "confirm" to proceed or "cancel"/"abort" to abort.`
            );
        }
    } catch (error) {
        if (error.message === 'time') {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Command timed out\n[Ready for input]█\x1b[0m```');
        } else {
            await message.channel.send(
                `\`\`\`ansi\n\x1b[32m[ERROR] ${error.message}\n[Ready for input]█\x1b[0m\`\`\``
            );
        }
    } finally {
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
        const validUsers = await DataService.getValidUsers();
        const invalidUsers = userList.filter(user => !validUsers.includes(user.toLowerCase()));
        
        if (invalidUsers.length > 0) {
            await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] Invalid users: ${invalidUsers.join(', ')}\n[Ready for input]█\x1b[0m\`\`\``);
            return;
        }

        let successfulAdditions = [];
        let failedUsers = [];

        for (const username of userList) {
            try {
                const validatedUsername = await validateUsername(username, userStats);
                if (validatedUsername) {
                    const success = await userStats.addBonusPoints(validatedUsername, points, reason);
                    if (success) {
                        await userStats.saveStats();
                        successfulAdditions.push(validatedUsername);
                    } else {
                        failedUsers.push(`${username} (duplicate points)`);
                    }
                } else {
                    failedUsers.push(username);
                }
            } catch (error) {
                console.error(`Error adding points to ${username}:`, error);
                failedUsers.push(username);
            }
        }

        // Force leaderboard update
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
        const validUsers = await DataService.getValidUsers();
        let successfulAdditions = 0;
        let failedUsers = [];

        for (const username of validUsers) {
            try {
                const validatedUsername = await validateUsername(username, userStats);
                if (validatedUsername) {
                    const success = await userStats.addBonusPoints(validatedUsername, points, reason);
                    if (success) {
                        await userStats.saveStats();
                        successfulAdditions++;
                    } else {
                        failedUsers.push(`${username} (duplicate points)`);
                    }
                } else {
                    failedUsers.push(username);
                }
            } catch (error) {
                console.error(`Error adding points to ${username}:`, error);
                failedUsers.push(username);
            }
        }

        // Force leaderboard update
        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }

        const embed = new TerminalEmbed()
            .setTerminalTitle('MASS POINTS ALLOCATION')
            .setTerminalDescription('[TRANSACTION COMPLETE]')
            .addTerminalField('OPERATION DETAILS', 
                `USERS AFFECTED: ${successfulAdditions}/${validUsers.length}\n` +
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

    try {
        const validatedUsername = await validateUsername(args[0], userStats);
        if (!validatedUsername) {
            await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${args[0]}" not found\n[Ready for input]█\x1b[0m\`\`\``);
            return;
        }

        const userStatsData = await DataService.getUserStats(validatedUsername);
        const currentYear = new Date().getFullYear().toString();
        const pointsBeforeReset = userStatsData?.yearlyPoints?.[currentYear] || 0;

        // Reset points and force save
        await userStats.resetUserPoints(validatedUsername);
        await userStats.saveStats();

        // Verify reset with fresh cache
        const afterStatsData = await DataService.getUserStats(validatedUsername);
        const pointsAfterReset = afterStatsData?.yearlyPoints?.[currentYear] || 0;

        // Force leaderboard update
        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }

        const embed = new TerminalEmbed()
            .setTerminalTitle('POINTS RESET')
            .setTerminalDescription('[OPERATION COMPLETE]')
            .addTerminalField('RESET DETAILS', 
                `USER: ${validatedUsername}\n` +
                `POINTS BEFORE RESET: ${pointsBeforeReset}\n` +
                `POINTS AFTER RESET: ${pointsAfterReset}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in handleResetPoints:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reset points\n[Ready for input]█\x1b[0m```');
    }
}

async function handleResetAllPoints(message, userStats) {
    try {
        const embed = new TerminalEmbed()
            .setTerminalTitle('CONFIRM MASS RESET')
            .setTerminalDescription('[WARNING: DESTRUCTIVE ACTION]')
            .addTerminalField('OPERATION',
                'This will reset ALL user points for the current year.\n' +
                'This action cannot be undone.')
            .addTerminalField(
                'CONFIRMATION',
                'Type "CONFIRM RESET" to proceed or anything else to cancel'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

        const filter = m => m.author.id === message.author.id;
        const collected = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
        });

        const response = collected.first();
        if (response.content === 'CONFIRM RESET') {
            const resetCount = await userStats.resetAllPoints();
            
            const confirmEmbed = new TerminalEmbed()
                .setTerminalTitle('POINTS RESET COMPLETE')
                .setTerminalDescription('[OPERATION SUCCESSFUL]')
                .addTerminalField('RESULTS',
                    `Reset points for ${resetCount} users\n` +
                    'All yearly points and bonus points have been cleared.')
                .setTerminalFooter();

            await message.channel.send({ embeds: [confirmEmbed] });
        } else {
            await message.channel.send('```ansi\n\x1b[32m[NOTICE] Reset cancelled\n[Ready for input]█\x1b[0m```');
        }
    } catch (error) {
        console.error('Error in handleResetAllPoints:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reset points\n[Ready for input]█\x1b[0m```');
    }
}

async function handleRecheckPoints(message, userStats) {
    try {
        await message.channel.send('```ansi\n\x1b[32m[NOTICE] Starting points recheck...\n```');

        const results = await userStats.recheckAllPoints(message.guild);

        const embed = new TerminalEmbed()
            .setTerminalTitle('POINTS RECHECK COMPLETE')
            .setTerminalDescription('[OPERATION SUCCESSFUL]')
            .addTerminalField('RESULTS',
                `Processed Users: ${results.processed.length}\n` +
                `Failed Users: ${results.errors.length}`);

        if (results.errors.length > 0) {
            embed.addTerminalField('ERRORS',
                results.errors.map(e => 
                    `${e.username}: ${e.error}`
                ).join('\n'));
        }

        embed.setTerminalFooter();
        await message.channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error in handleRecheckPoints:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to recheck points\n[Ready for input]█\x1b[0m```');
    }
}

async function handleCleanupPoints(message, userStats) {
    try {
        await message.channel.send('```ansi\n\x1b[32m[NOTICE] Starting duplicate points cleanup...\n```');

        // First, confirm the action
        const confirmEmbed = new TerminalEmbed()
            .setTerminalTitle('CONFIRM POINTS CLEANUP')
            .setTerminalDescription('[WARNING: DATABASE MODIFICATION]')
            .addTerminalField('OPERATION',
                'This will remove all duplicate point entries for the current year.\n' +
                'Points totals will be adjusted accordingly.\n' +
                'This action cannot be undone.')
            .addTerminalField(
                'CONFIRMATION',
                'Type "CONFIRM CLEANUP" to proceed or anything else to cancel'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [confirmEmbed] });

        const filter = m => m.author.id === message.author.id;
        const collected = await message.channel.awaitMessages({
            filter,
            max: 1,
            time: 30000,
            errors: ['time']
        });

        const response = collected.first();
        if (response.content !== 'CONFIRM CLEANUP') {
            await message.channel.send('```ansi\n\x1b[32m[NOTICE] Cleanup cancelled\n[Ready for input]█\x1b[0m```');
            return;
        }

        const results = await userStats.database.cleanupDuplicatePoints();

        // Send summary first
        const summaryEmbed = new TerminalEmbed()
            .setTerminalTitle('POINTS CLEANUP COMPLETE')
            .setTerminalDescription('[OPERATION SUCCESSFUL]')
            .addTerminalField('SUMMARY',
                `Total Duplicates Removed: ${results.totalDuplicatesRemoved}\n` +
                `Users Affected: ${results.usersAffected}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [summaryEmbed] });

        // If there are details, split them into chunks and send multiple embeds
        if (results.details.length > 0) {
            const chunkSize = 5; // Number of users per embed
            for (let i = 0; i < results.details.length; i += chunkSize) {
                const chunk = results.details.slice(i, i + chunkSize);
                const chunkEmbed = new TerminalEmbed()
                    .setTerminalTitle(`CLEANUP DETAILS (${i/chunkSize + 1}/${Math.ceil(results.details.length/chunkSize)})`)
                    .setTerminalDescription('[DETAILED RESULTS]');

                for (const user of chunk) {
                    // Create a condensed version of the reasons
                    const reasonCounts = {};
                    user.duplicateReasons.forEach(reason => {
                        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
                    });
                    
                    const formattedReasons = Object.entries(reasonCounts)
                        .map(([reason, count]) => `${reason}${count > 1 ? ` (×${count})` : ''}`)
                        .join('\n');

                    chunkEmbed.addTerminalField(user.username,
                        `Duplicates Removed: ${user.duplicatesRemoved}\n` +
                        `Points Adjusted: ${user.pointsAdjusted}\n` +
                        `Reasons:\n${formattedReasons}`
                    );
                }

                chunkEmbed.setTerminalFooter();
                await message.channel.send({ embeds: [chunkEmbed] });
                
                // Add a small delay between embeds to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Force leaderboard update if any changes were made
        if (results.usersAffected > 0 && global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
            await message.channel.send('```ansi\n\x1b[32m[NOTICE] Leaderboard updated with new point totals\n[Ready for input]█\x1b[0m```');
        }

    } catch (error) {
        console.error('Error in handleCleanupPoints:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to cleanup points\n[Ready for input]█\x1b[0m```');
    }
}

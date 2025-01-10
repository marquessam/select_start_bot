import TerminalEmbed = require('../utils/embedBuilder.js');
import database = require('../database.js');

export default {
    name: 'view',
    description: 'View various system information and archives',
    async execute(message, args, { shadowGame }) {
        try {
            if (!args.length) {
                return await showHelp(message);
            }

            const [subcommand, ...subArgs] = args;

            switch(subcommand) {
                case 'archive':
                    await handleViewArchive(message, subArgs);
                    break;
                case 'config':
                    await handleViewConfig(message);
                    break;
                case 'stats':
                    await handleViewStats(message);
                    break;
                case 'games':
                    await handleViewGames(message);
                    break;
                default:
                    await showHelp(message);
            }

            if (shadowGame) {
                await shadowGame.tryShowError(message);
            }
        } catch (error) {
            console.error('View Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] View operation failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

async function showHelp(message) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('VIEW COMMANDS')
        .setTerminalDescription('[COMMAND USAGE]')
        .addTerminalField('AVAILABLE COMMANDS',
            '!view archive <month> - View archived rankings\n' +
            '!view config - View current system configuration\n' +
            '!view stats - View community statistics\n' +
            '!view games - View list of valid games')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleViewArchive(message, args) {
    if (args.length < 1) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Month parameter required\nUsage: !view archive <month>\n[Ready for input]█\x1b[0m```');
        return;
    }

    const month = args[0];
    await message.channel.send('```ansi\n\x1b[32m> Accessing archived data...\x1b[0m\n```');
    
    const stats = await database.getUserStats();
    const year = new Date().getFullYear().toString();
    
    if (!stats.monthlyStats?.[year]?.[month]) {
        await message.channel.send('```ansi\n\x1b[32m[ERROR] No archive found for ' + month + '\n[Ready for input]█\x1b[0m```');
        return;
    }

    const archive = stats.monthlyStats[year][month];

    const embed = new TerminalEmbed()
        .setTerminalTitle(`ARCHIVED RANKINGS: ${month.toUpperCase()}`)
        .setThumbnail(`https://retroachievements.org${archive.gameInfo.ImageIcon}`)
        .setTerminalDescription('[ARCHIVE ACCESS GRANTED]');

    archive.leaderboard.slice(0, 3).forEach((user, index) => {
        const medals = ['🥇', '🥈', '🥉'];
        embed.addTerminalField(
            `${medals[index]} ${user.username}`,
            `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\n` +
            `PROGRESS: ${user.completionPercentage}%`
        );
    });

    const additionalUsers = archive.leaderboard.slice(3);
    if (additionalUsers.length > 0) {
        embed.addTerminalField(
            'ADDITIONAL PARTICIPANTS',
            additionalUsers.map(user => user.username).join(', ')
        );
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}

async function handleViewConfig(message) {
    const config = await database.getConfiguration();
    
    const embed = new TerminalEmbed()
        .setTerminalTitle('SYSTEM CONFIGURATION')
        .setTerminalDescription('[DATABASE ACCESS GRANTED]')
        .addTerminalField('DEFAULT RULES',
            config.defaultRules.map(rule => `> ${rule}`).join('\n'))
        .addTerminalField('POINTS STRUCTURE',
            `1ST PLACE: ${config.defaultPoints.first}\n` +
            `2ND PLACE: ${config.defaultPoints.second}\n` +
            `3RD PLACE: ${config.defaultPoints.third}`)
        .addTerminalField('CHANNEL CONFIGURATION',
            `ANNOUNCEMENTS: ${config.channels.announcements || 'Not Set'}\n` +
            `SUBMISSIONS: ${config.channels.submissions || 'Not Set'}\n` +
            `LEADERBOARD: ${config.channels.leaderboard || 'Not Set'}`)
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleViewStats(message) {
    const stats = await database.getUserStats();
    const records = await database.getCommunityRecords();
    const year = new Date().getFullYear().toString();
    
    const yearlyStats = Object.values(stats.users).reduce((acc, user) => {
        if (user.yearlyStats?.[year]) {
            acc.totalGamesCompleted += user.yearlyStats[year].totalGamesCompleted || 0;
            acc.totalAchievements += user.yearlyStats[year].totalAchievementsUnlocked || 0;
            acc.monthlyParticipations += user.yearlyStats[year].monthlyParticipations || 0;
        }
        return acc;
    }, { totalGamesCompleted: 0, totalAchievements: 0, monthlyParticipations: 0 });

    const embed = new TerminalEmbed()
        .setTerminalTitle('COMMUNITY STATISTICS')
        .setTerminalDescription('[DATABASE ACCESS GRANTED]')
        .addTerminalField('YEARLY TOTALS',
            `GAMES COMPLETED: ${yearlyStats.totalGamesCompleted}\n` +
            `ACHIEVEMENTS UNLOCKED: ${yearlyStats.totalAchievements}\n` +
            `MONTHLY PARTICIPATIONS: ${yearlyStats.monthlyParticipations}`)
        .addTerminalField('RECORDS',
            `PERFECT MONTHS: ${records.hallOfFame.perfectMonths.length}\n` +
            `SPEEDRUNNERS: ${records.hallOfFame.speedrunners.length}\n` +
            `COMPLETIONISTS: ${records.hallOfFame.completionists.length}`)
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleViewGames(message) {
    const validGames = await database.getValidGamesList();
    
    const embed = new TerminalEmbed()
        .setTerminalTitle('VALID GAMES LIST')
        .setTerminalDescription('[DATABASE ACCESS GRANTED]')
        .addTerminalField('TOTAL GAMES', `${validGames.length} games registered`);

    // Split games into chunks of 15 for multiple fields
    const chunkSize = 15;
    for (let i = 0; i < validGames.length; i += chunkSize) {
        const chunk = validGames.slice(i, i + chunkSize);
        embed.addTerminalField(
            `GAMES ${i + 1}-${Math.min(i + chunkSize, validGames.length)}`,
            chunk.join('\n')
        );
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}

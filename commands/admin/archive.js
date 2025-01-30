// commands/admin/archive.js

const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'archive',
    description: 'Manage and view challenge archives',
    async execute(message, args) {
        try {
            // Check permissions for admin-only commands
            const isAdmin = message.member?.permissions.has('Administrator') ||
                          message.member?.roles.cache.has(process.env.ADMIN_ROLE_ID);

            if (!args.length) {
                return await showHelp(message, isAdmin);
            }

            const subcommand = args[0].toLowerCase();

            // Commands that require admin permissions
            if (['save', 'edit', 'addnote', 'settiebreaker'].includes(subcommand)) {
                if (!isAdmin) {
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                    return;
                }
            }

            switch(subcommand) {
                case 'save':
                    await saveCurrentChallenge(message);
                    break;
                case 'view':
                    await viewArchive(message, args.slice(1));
                    break;
                case 'stats':
                    await viewStats(message, args.slice(1));
                    break;
                case 'edit':
                    await editArchive(message, args.slice(1));
                    break;
                case 'addnote':
                    await addNote(message, args.slice(1));
                    break;
                case 'settiebreaker':
                    await setTiebreaker(message, args.slice(1));
                    break;
                default:
                    await showHelp(message, isAdmin);
            }
        } catch (error) {
            console.error('Archive Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Archive operation failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

async function showHelp(message, isAdmin) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('ARCHIVE SYSTEM')
        .setTerminalDescription('[COMMAND USAGE]')
        .addTerminalField('VIEW COMMANDS',
            '!archive view <month> <year> - View specific challenge archive\n' +
            '!archive view latest - View most recent archive\n' +
            '!archive stats <year> - View yearly statistics');

    if (isAdmin) {
        embed.addTerminalField('ADMIN COMMANDS',
            '!archive save - Save current challenge to archive\n' +
            '!archive edit <month> <year> <field> <value> - Edit archive entry\n' +
            '!archive addnote <month> <year> <note> - Add note to archive\n' +
            '!archive settiebreaker <month> <year> <results> - Add tiebreaker results'
        );

        embed.addTerminalField('EXAMPLES',
            '!archive edit January 2025 winner username\n' +
            '!archive addnote January 2025 Excellent participation this month!\n' +
            '!archive settiebreaker January 2025 "1st: user1 (1:23.45), 2nd: user2 (1:24.56)"'
        );
    }

    embed.setTerminalFooter();
    await message.channel.send({ embeds: [embed] });
}

// ... [Previous saveCurrentChallenge, viewArchive, and viewStats functions remain the same] ...

async function editArchive(message, args) {
    try {
        if (args.length < 4) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !archive edit <month> <year> <field> <value>\n[Ready for input]█\x1b[0m```');
            return;
        }

        const [month, year, field, ...valueArgs] = args;
        const value = valueArgs.join(' ');

        const history = await database.getPreviousChallenges();
        const archiveIndex = history.findIndex(entry => {
            const entryDate = new Date(entry.date);
            return (
                entryDate.getFullYear().toString() === year &&
                entryDate.toLocaleString('default', { month: 'long' }) === month
            );
        });

        if (archiveIndex === -1) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] No archive found for specified date\n[Ready for input]█\x1b[0m```');
            return;
        }

        // Update the specified field
        const archiveEntry = history[archiveIndex];
        switch(field.toLowerCase()) {
            case 'winner':
                archiveEntry.winner = value;
                break;
            case 'participants':
                try {
                    archiveEntry.participants = JSON.parse(value);
                } catch (e) {
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid participants data format\n[Ready for input]█\x1b[0m```');
                    return;
                }
                break;
            default:
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid field\n[Ready for input]█\x1b[0m```');
                return;
        }

        // Save updated history
        await database.saveGameHistory(history);

        const embed = new TerminalEmbed()
            .setTerminalTitle('ARCHIVE UPDATED')
            .setTerminalDescription('[UPDATE SUCCESSFUL]')
            .addTerminalField('CHANGES',
                `MONTH: ${month} ${year}\n` +
                `FIELD: ${field}\n` +
                `NEW VALUE: ${value}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Archive Edit Error:', error);
        throw error;
    }
}

async function addNote(message, args) {
    try {
        if (args.length < 3) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !archive addnote <month> <year> <note>\n[Ready for input]█\x1b[0m```');
            return;
        }

        const [month, year, ...noteArgs] = args;
        const note = noteArgs.join(' ');

        const history = await database.getPreviousChallenges();
        const archiveIndex = history.findIndex(entry => {
            const entryDate = new Date(entry.date);
            return (
                entryDate.getFullYear().toString() === year &&
                entryDate.toLocaleString('default', { month: 'long' }) === month
            );
        });

        if (archiveIndex === -1) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] No archive found for specified date\n[Ready for input]█\x1b[0m```');
            return;
        }

        // Add note to archive
        const archiveEntry = history[archiveIndex];
        archiveEntry.notes = archiveEntry.notes ? `${archiveEntry.notes}\n${note}` : note;

        // Save updated history
        await database.saveGameHistory(history);

        const embed = new TerminalEmbed()
            .setTerminalTitle('NOTE ADDED')
            .setTerminalDescription('[UPDATE SUCCESSFUL]')
            .addTerminalField('DETAILS',
                `MONTH: ${month} ${year}\n` +
                `NOTE: ${note}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Add Note Error:', error);
        throw error;
    }
}

async function setTiebreaker(message, args) {
    try {
        if (args.length < 3) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !archive settiebreaker <month> <year> <results>\n[Ready for input]█\x1b[0m```');
            return;
        }

        const [month, year, ...resultsArgs] = args;
        const results = resultsArgs.join(' ');

        const history = await database.getPreviousChallenges();
        const archiveIndex = history.findIndex(entry => {
            const entryDate = new Date(entry.date);
            return (
                entryDate.getFullYear().toString() === year &&
                entryDate.toLocaleString('default', { month: 'long' }) === month
            );
        });

        if (archiveIndex === -1) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] No archive found for specified date\n[Ready for input]█\x1b[0m```');
            return;
        }

        // Add tiebreaker results
        const archiveEntry = history[archiveIndex];
        archiveEntry.tiebreaker = {
            date: new Date().toISOString(),
            results: results
        };

        // Save updated history
        await database.saveGameHistory(history);

        const embed = new TerminalEmbed()
            .setTerminalTitle('TIEBREAKER RECORDED')
            .setTerminalDescription('[UPDATE SUCCESSFUL]')
            .addTerminalField('DETAILS',
                `MONTH: ${month} ${year}\n` +
                `RESULTS: ${results}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Set Tiebreaker Error:', error);
        throw error;
    }
}

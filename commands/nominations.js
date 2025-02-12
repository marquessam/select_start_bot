const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

const nominations = {
    name: 'nominations',
    description: 'Manage game nominations',

    async execute(message, args, { shadowGame }) {
        try {
            if (!args.length) {
                await this.showHelp(message);
                return;
            }

            const subcommand = args[0].toLowerCase();

            // Define admin-only subcommands (added "clear")
            const adminCommands = ['open', 'close', 'remove', 'edit', 'clear'];
            
            // Check permissions only for admin subcommands
            if (adminCommands.includes(subcommand)) {
                const hasPermission = message.member && (
                    message.member.permissions.has('Administrator') ||
                    message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)
                );

                if (!hasPermission) {
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                    return;
                }
            }

            switch (subcommand) {
                case 'view':
                    await this.handleView(message, shadowGame);
                    break;
                case 'add':
                    await this.handleAdd(message, args.slice(1));
                    break;
                case 'remove':
                    await this.handleRemove(message, args.slice(1));
                    break;
                case 'edit':
                    await this.handleEdit(message, args.slice(1));
                    break;
                case 'open':
                    await this.handleOpen(message);
                    break;
                case 'close':
                    await this.handleClose(message);
                    break;
                case 'clear':
                    await this.handleClear(message);
                    break;
                default:
                    await this.showHelp(message);
            }
        } catch (error) {
            console.error('Nominations Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Unable to process nomination command\n[Ready for input]█\x1b[0m```');
        }
    },

    async showHelp(message) {
        const isAdmin = message.member && (
            message.member.permissions.has('Administrator') ||
            message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)
        );

        const baseCommands = 
            '!nominations view - View current nominations\n' +
            '!nominations add <platform> <game> - Submit a nomination (max 3 per user)';

        const adminCommands = 
            '\n!nominations open - Open nominations\n' +
            '!nominations close - Close nominations\n' +
            '!nominations remove <game> - Remove a nomination\n' +
            '!nominations edit <game> | <new name> [platform] - Edit a nomination\n' +
            '!nominations clear - Clear all nominations and reset nomination counts';

        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATION SYSTEM')
            .setTerminalDescription('[HELP MENU]')
            .addTerminalField('AVAILABLE COMMANDS',
                isAdmin ? baseCommands + adminCommands : baseCommands)
            .addTerminalField('VALID PLATFORMS', 
                'NES, MASTER SYSTEM, GENESIS, SNES, GB, GBC, GBA, GAME GEAR, NEO GEO, TURBOGRAFX-16, PSX, N64, SATURN, PICO8, MAME')
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    },

    async handleAdd(message, args) {
        if (args.length < 2) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !nominations add <platform> <game name>\n[Ready for input]█\x1b[0m```');
            return;
        }

        const nominationStatus = await database.getNominationStatus();
        if (!nominationStatus?.isOpen) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Nominations are closed, check event calendar for more details\n[Ready for input]█\x1b[0m```');
            return;
        }

        // Check number of nominations
        const nominationCount = await database.getUserNominationCount(message.author.id);
        const NOMINATION_LIMIT = 3;
        if (nominationCount >= NOMINATION_LIMIT) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] You have already used all your nominations (maximum 3)\n[Ready for input]█\x1b[0m```');
            return;
        }

        const platform = args[0].toUpperCase();
        const validPlatforms = ['NES', 'MASTER SYSTEM', 'GENESIS', 'SNES', 
            'GB', 'GBC', 'GBA', 'GAME GEAR', 
            'NEO GEO', 'TURBOGRAFX-16', 'PSX', 'N64', 'SATURN'];
        
        if (!validPlatforms.includes(platform)) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid platform. Valid platforms: NES, MASTER SYSTEM, GENESIS, SNES, GB, GBC, GBA, GAME GEAR, NEO GEO, TURBOGRAFX-16, PSX, N64, SATURN\n[Ready for input]█\x1b[0m```');
            return;
        }

        const gameName = args.slice(1).join(' ');
        if (!gameName) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Please provide a game name\n[Ready for input]█\x1b[0m```');
            return;
        }

        // Check for duplicate nomination
        const existingNominations = await database.getNominations();
        const isDuplicate = existingNominations.some(nom => 
            nom.game.toLowerCase() === gameName.toLowerCase()
        );

        if (isDuplicate) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] This game has already been nominated\n[Ready for input]█\x1b[0m```');
            return;
        }

        await database.addNomination({
            game: gameName,
            discordId: message.author.id,
            discordUsername: message.author.username,
            platform
        });

        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATION SUBMITTED')
            .setTerminalDescription('[SUBMISSION SUCCESSFUL]')
            .addTerminalField('DETAILS',
                `GAME: ${gameName}\n` +
                `PLATFORM: ${platform}\n` +
                `SUBMITTED BY: ${message.author.username}\n` +
                `DATE: ${new Date().toLocaleDateString()}`)
            .addTerminalField('REMAINING NOMINATIONS',
                `You have ${NOMINATION_LIMIT - (nominationCount + 1)} nomination${NOMINATION_LIMIT - (nominationCount + 1) !== 1 ? 's' : ''} remaining`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    },

    async handleView(message, shadowGame) {
        await message.channel.send('```ansi\n\x1b[32m> Accessing nominations database...\x1b[0m```');

        // Retrieve the full nominations document.
        // Assumes structure: { _id: 'nominations', nominations: { 'YYYY-MM': [ ... ], ... } }
        const collection = await database.getCollection('nominations');
        const nominationsDoc = await collection.findOne({ _id: 'nominations' });
        
        if (!nominationsDoc || !nominationsDoc.nominations) {
            const embed = new TerminalEmbed()
                .setTerminalTitle('NOMINATED TITLES')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]')
                .addTerminalField('STATUS', 'No nominations found')
                .setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            return;
        }
        
        // Combine nominations from all periods into a single array.
        let allNominations = [];
        for (const period in nominationsDoc.nominations) {
            if (Array.isArray(nominationsDoc.nominations[period])) {
                allNominations = allNominations.concat(nominationsDoc.nominations[period]);
            }
        }
        
        if (!allNominations.length) {
            const embed = new TerminalEmbed()
                .setTerminalTitle('NOMINATED TITLES')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]')
                .addTerminalField('STATUS', 'No nominations found')
                .setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            return;
        }
        
        // Group nominations by platform for display
        const groupedNominations = allNominations.reduce((acc, nom) => {
            if (!acc[nom.platform]) acc[nom.platform] = [];
            acc[nom.platform].push(`${nom.game} (by ${nom.discordUsername})`);
            return acc;
        }, {});
        
        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATED TITLES')
            .setTerminalDescription('[DATABASE ACCESS GRANTED]');
        
        for (const [platform, games] of Object.entries(groupedNominations).sort()) {
            if (games.length > 0) {
                embed.addTerminalField(
                    `PLATFORM: ${platform.toUpperCase()}`,
                    games.map(game => `> ${game}`).join('\n')
                );
            }
        }
        
        embed.setTerminalFooter();
        await message.channel.send({ embeds: [embed] });
        
        if (shadowGame) {
            await shadowGame.tryShowError(message);
        }
    },

    async handleRemove(message, args) {
        if (args.length < 1) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !nominations remove <game name>\n[Ready for input]█\x1b[0m```');
            return;
        }

        const gameName = args.join(' ');
        const collection = await database.getCollection('nominations');
        const nominationsDoc = await collection.findOne({ _id: 'nominations' });

        if (!nominationsDoc || !nominationsDoc.nominations) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] No nominations found in the database\n[Ready for input]█\x1b[0m```');
            return;
        }

        let foundNomination = null;
        let foundPeriod = null;

        // Iterate over each period to find the nomination.
        for (const period in nominationsDoc.nominations) {
            const nomination = nominationsDoc.nominations[period].find(n => n.game.toLowerCase() === gameName.toLowerCase());
            if (nomination) {
                foundNomination = nomination;
                foundPeriod = period;
                break;
            }
        }

        if (!foundNomination) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Nomination not found\n[Ready for input]█\x1b[0m```');
            return;
        }

        // Remove the nomination from the correct period.
        await collection.updateOne(
            { _id: 'nominations' },
            {
                $pull: {
                    [`nominations.${foundPeriod}`]: { game: foundNomination.game }
                }
            }
        );

        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATION REMOVED')
            .setTerminalDescription('[UPDATE SUCCESSFUL]')
            .addTerminalField('DETAILS',
                `GAME: ${foundNomination.game}\n` +
                `PLATFORM: ${foundNomination.platform}\n` +
                `SUBMITTED BY: ${foundNomination.discordUsername}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    },

    async handleEdit(message, args) {
        const fullArg = args.join(' ');
        const [oldName, ...newDetails] = fullArg.split('|').map(s => s.trim());
        
        if (!oldName || !newDetails.length) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !nominations edit <current game name> | <new game name> [platform]\n[Ready for input]█\x1b[0m```');
            return;
        }

        const nominations = await database.getNominations();
        const nomination = nominations.find(n => n.game.toLowerCase() === oldName.toLowerCase());

        if (!nomination) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Nomination not found\n[Ready for input]█\x1b[0m```');
            return;
        }

        const newDetailsArr = newDetails[0].split(' ');
        let newName = newDetailsArr.slice(0, -1).join(' ') || newDetailsArr[0];
        let newPlatform = newDetailsArr[newDetailsArr.length - 1].toUpperCase();

        const validPlatforms = ['NES', 'MASTER SYSTEM', 'GENESIS', 'SNES', 
            'GB', 'GBC', 'GBA', 'GAME GEAR', 
            'NEO GEO', 'TURBOGRAFX-16', 'PSX', 'N64', 'SATURN'];

        if (!validPlatforms.includes(newPlatform)) {
            newName = newDetails[0];
            newPlatform = nomination.platform;
        } else if (newDetailsArr.length === 1) {
            newName = nomination.game;
        }

        const collection = await database.getCollection('nominations');
        const period = new Date().toISOString().slice(0, 7);

        await collection.updateOne(
            { 
                _id: 'nominations',
                [`nominations.${period}.game`]: nomination.game
            },
            { 
                $set: { 
                    [`nominations.${period}.$.game`]: newName,
                    [`nominations.${period}.$.platform`]: newPlatform
                }
            }
        );

        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATION EDITED')
            .setTerminalDescription('[UPDATE SUCCESSFUL]')
            .addTerminalField('ORIGINAL',
                `GAME: ${nomination.game}\n` +
                `PLATFORM: ${nomination.platform}`)
            .addTerminalField('UPDATED',
                `GAME: ${newName}\n` +
                `PLATFORM: ${newPlatform}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    },

    // New subcommand to clear all nominations and reset nomination counts.
    async handleClear(message) {
        const collection = await database.getCollection('nominations');
        
        // Reset the nominations document by setting the nominations field to an empty object.
        await collection.updateOne(
            { _id: 'nominations' },
            { $set: { nominations: {} } }
        );

        // If there is additional user-specific nomination count data elsewhere,
        // include its reset logic here.
        
        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATIONS CLEARED')
            .setTerminalDescription('[RESET SUCCESSFUL]')
            .addTerminalField('DETAILS', 'All nominations have been cleared and users may now submit new nominations.')
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    },

    async handleOpen(message) {
        await database.setNominationStatus(true);
        
        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATIONS OPENED')
            .setTerminalDescription('[STATUS UPDATE SUCCESSFUL]')
            .addTerminalField('STATUS', 'Nominations are now open for submissions')
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    },

    async handleClose(message) {
        await database.setNominationStatus(false);
        
        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATIONS CLOSED')
            .setTerminalDescription('[STATUS UPDATE SUCCESSFUL]')
            .addTerminalField('STATUS', 'Nominations are now closed')
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    }
};

module.exports = nominations;

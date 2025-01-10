// commands/nominations.js
const TerminalEmbed = require('../utils/embedBuilder.');
const database = require('../database.');

const nominations = {
    name: 'nominations',
    aliases: ['nominate', 'nomination'], // Add aliases
    description: 'Manage game nominations',

    async execute(message, args, { shadowGame, mobyAPI }) {  // Add mobyAPI
        try {
            if (!args.length) {
                await this.showHelp(message);
                return;
            }

            const subcommand = args[0].toLowerCase();
            const adminCommands = ['open', 'close', 'remove', 'edit'];
            
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

            switch(subcommand) {
                case 'view':
                    await this.handleView(message, shadowGame);
                    break;
                case 'add':
                    await this.handleAdd(message, args.slice(1), mobyAPI);
                    break;
                case 'remove':
                    await this.handleRemove(message, args.slice(1));
                    break;
                case 'edit':
                    await this.handleEdit(message, args.slice(1), mobyAPI);
                    break;
                case 'open':
                    await this.handleOpen(message);
                    break;
                case 'close':
                    await this.handleClose(message);
                    break;
                default:
                    await this.showHelp(message);
            }
        } catch (error) {
            console.error('Nominations Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Unable to process nomination command\n[Ready for input]█\x1b[0m```');
        }
    },

    async getUserMonthlyNominationCount(discordId) {
        const currentMonth = new Date().toISOString().slice(0, 7); // Format: YYYY-MM
        const nominations = await database.getNominations();
        return nominations.filter(nom => 
            nom.discordId === discordId && 
            nom.submittedAt?.startsWith(currentMonth)
        ).length;
    },

    async handleAdd(message, args, mobyAPI) {
        if (args.length < 2) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !nominations add <platform> <game name>\n[Ready for input]█\x1b[0m```');
            return;
        }

        const nominationStatus = await database.getNominationStatus();
        if (!nominationStatus?.isOpen) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Nominations are closed, check event calendar for more details\n[Ready for input]█\x1b[0m```');
            return;
        }

        // Check monthly nomination count
        const monthlyCount = await this.getUserMonthlyNominationCount(message.author.id);
        const MONTHLY_LIMIT = 3;
        const remainingNominations = MONTHLY_LIMIT - monthlyCount;

        if (remainingNominations <= 0) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] You have reached your monthly nomination limit (3). Try again next month!\n[Ready for input]█\x1b[0m```');
            return;
        }

        const platform = args[0].toUpperCase();
        const validPlatforms = [
            'NES', 'MASTER SYSTEM', 'GENESIS', 'SNES', 
            'GB', 'GBC', 'GBA', 'GAME GEAR', 
            'NEO GEO', 'TURBOGRAFX-16', 'PSX', 'N64', 'SATURN'
        ];
        
        if (!validPlatforms.includes(platform)) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid platform. Valid platforms: ' + validPlatforms.join(', ') + '\n[Ready for input]█\x1b[0m```');
            return;
        }

        const gameName = args.slice(1).join(' ');
        if (!gameName) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Please provide a game name\n[Ready for input]█\x1b[0m```');
            return;
        }

        try {
            // Search for the game using MobyAPI
            const searchResults = await mobyAPI.searchGames(gameName);
            
            if (searchResults?.games?.length > 0) {
                const bestMatch = searchResults.games[0];
                
                const confirmEmbed = new TerminalEmbed()
                    .setTerminalTitle('GAME VERIFICATION')
                    .setTerminalDescription('[MATCH FOUND]')
                    .addTerminalField('DID YOU MEAN?',
                        `${bestMatch.title}\n\n` +
                        'Type "yes" to use this name or "no" to use your original entry.')
                    .setTerminalFooter();

                await message.channel.send({ embeds: [confirmEmbed] });

                const filter = m => m.author.id === message.author.id && 
                    ['yes', 'no', 'y', 'n'].includes(m.content.toLowerCase());
                
                const collected = await message.channel.awaitMessages({
                    filter,
                    max: 1,
                    time: 30000,
                    errors: ['time']
                });

                const response = collected.first().content.toLowerCase();
                const finalGameName = (response === 'yes' || response === 'y') ? bestMatch.title : gameName;

                await this.submitNomination(message, finalGameName, platform, remainingNominations);
            } else {
                await this.submitNomination(message, gameName, platform, remainingNominations);
            }
        } catch (error) {
            console.error('Game verification error:', error);
            await this.submitNomination(message, gameName, platform, remainingNominations);
        }
    },

    async submitNomination(message, gameName, platform, remainingNominations) {
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
            platform,
            submittedAt: new Date().toISOString()
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
                `You have ${remainingNominations - 1} nomination${remainingNominations - 1 !== 1 ? 's' : ''} remaining this month`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    },

    async handleView(message, shadowGame) {
        await message.channel.send('```ansi\n\x1b[32m> Accessing nominations database...\x1b[0m\n```');
        
        const nominations = await database.getNominations();
        
        if (!nominations.length) {
            const embed = new TerminalEmbed()
                .setTerminalTitle('NOMINATED TITLES')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]')
                .addTerminalField('STATUS', 'No nominations found for the current period')
                .setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            return;
        }

        const groupedNominations = nominations.reduce((acc, nom) => {
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
        // First prompt for game name
        await message.channel.send('```ansi\n\x1b[32mEnter the name of the game to remove:\x1b[0m```');

        const filter = m => m.author.id === message.author.id;
        let response;

        try {
            response = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            });
        } catch (error) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Remove operation timed out\n[Ready for input]█\x1b[0m```');
            return;
        }

        const gameName = response.first().content.trim();
        const nominations = await database.getNominations();
        const nomination = nominations.find(n => n.game.toLowerCase() === gameName.toLowerCase());

        if (!nomination) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Nomination not found\n[Ready for input]█\x1b[0m```');
            return;
        }

        const collection = await database.getCollection('nominations');
        const period = new Date().toISOString().slice(0, 7);

        await collection.updateOne(
            { _id: 'nominations' },
            { 
                $pull: { 
                    [`nominations.${period}`]: { game: nomination.game }
                } 
            }
        );

        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATION REMOVED')
            .setTerminalDescription('[UPDATE SUCCESSFUL]')
            .addTerminalField('DETAILS',
                `GAME: ${nomination.game}\n` +
                `PLATFORM: ${nomination.platform}\n` +
                `SUBMITTED BY: ${nomination.discordUsername}`)
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    },

    async handleEdit(message, args, mobyAPI) {
        try {
            // Step 1: Ask for current game name
            await message.channel.send('```ansi\n\x1b[32mEnter the current game name you want to edit:\x1b[0m```');
            
            const filter = m => m.author.id === message.author.id;
            const timeout = 30000;

            let response = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: timeout,
                errors: ['time']
            });

            const oldName = response.first().content.trim();
            const nominations = await database.getNominations();
            const nomination = nominations.find(n => n.game.toLowerCase() === oldName.toLowerCase());

            if (!nomination) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Nomination not found\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Step 2: Ask for new game name
            await message.channel.send('```ansi\n\x1b[32mEnter the new game name:\x1b[0m```');
            
            response = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: timeout,
                errors: ['time']
            });

            let newName = response.first().content.trim();

            // Verify new game name with MobyAPI
            try {
                const searchResults = await mobyAPI.searchGames(newName);
                if (searchResults?.games?.length > 0) {
                    const bestMatch = searchResults.games[0];
                    
                    const confirmEmbed = new TerminalEmbed()
                        .setTerminalTitle('GAME VERIFICATION')
                        .setTerminalDescription('[MATCH FOUND]')
                        .addTerminalField('DID YOU MEAN?',
                            `${bestMatch.title}\n\n` +
                            'Type "yes" to use this name or "no" to use your original entry.')
                        .setTerminalFooter();

                    await message.channel.send({ embeds: [confirmEmbed] });

                    const confirmFilter = m => m.author.id === message.author.id && 
                        ['yes', 'no', 'y', 'n'].includes(m.content.toLowerCase());

                    const confirmation = await message.channel.awaitMessages({
                        filter: confirmFilter,
                        max: 1,
                        time: timeout,
                        errors: ['time']
                    });

                    const confirmResponse = confirmation.first().content.toLowerCase();
                    if (confirmResponse === 'yes' || confirmResponse === 'y') {
                        newName = bestMatch.title;
                    }
                }
            } catch (error) {
                console.error('Game verification error:', error);
                // Continue with user's original input if API fails
            }

            // Step 3: Ask if they want to change the platform
            await message.channel.send(`\`\`\`ansi\n\x1b[32mCurrent platform is ${nomination.platform}. Would you like to change it? (yes/no)\x1b[0m\`\`\``);
            
           response = await message.channel.awaitMessages({
                filter: m => m.author.id === message.author.id && ['yes', 'no', 'y', 'n'].includes(m.content.toLowerCase()),
                max: 1,
                time: timeout,
                errors: ['time']
            });

            let newPlatform = nomination.platform;
            const validPlatforms = [
                'NES', 'MASTER SYSTEM', 'GENESIS', 'SNES', 
                'GB', 'GBC', 'GBA', 'GAME GEAR', 
                'NEO GEO', 'TURBOGRAFX-16', 'PSX', 'N64', 'SATURN'
            ];

            if (response.first().content.toLowerCase().startsWith('y')) {
                await message.channel.send('```ansi\n\x1b[32mEnter the new platform:\x1b[0m```');
                
                response = await message.channel.awaitMessages({
                    filter,
                    max: 1,
                    time: timeout,
                    errors: ['time']
                });

                const platformInput = response.first().content.trim().toUpperCase();
                if (validPlatforms.includes(platformInput)) {
                    newPlatform = platformInput;
                } else {
                    await message.channel.send('```ansi\n\x1b[32m[WARNING] Invalid platform. Keeping original platform.\x1b[0m```');
                }
            }

            // Update the nomination in database
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
                        [`nominations.${period}.$.platform`]: newPlatform,
                        [`nominations.${period}.$.lastModified`]: new Date().toISOString()
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

        } catch (error) {
            if (error.code === 'AWAITING_MESSAGES_TIMEOUT') {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Edit operation timed out\n[Ready for input]█\x1b[0m```');
            } else {
                console.error('Edit nomination error:', error);
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to edit nomination\n[Ready for input]█\x1b[0m```');
            }
        }
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
    },

    async showHelp(message) {
        const isAdmin = message.member && (
            message.member.permissions.has('Administrator') ||
            message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)
        );

        const baseCommands = 
            '!nominations view - View current nominations\n' +
            '!nominations add <platform> <game> - Submit a nomination (max 3 per month)';

        const adminCommands = 
            '\n!nominations open - Open nominations\n' +
            '!nominations close - Close nominations\n' +
            '!nominations remove - Remove a nomination\n' +
            '!nominations edit - Edit a nomination';

        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATION SYSTEM')
            .setTerminalDescription('[HELP MENU]')
            .addTerminalField('AVAILABLE COMMANDS',
                isAdmin ? baseCommands + adminCommands : baseCommands)
            .addTerminalField('VALID PLATFORMS', 
                'NES, MASTER SYSTEM, GENESIS, SNES, GB, GBC, GBA, GAME GEAR, NEO GEO, TURBOGRAFX-16, PSX, N64, SATURN')
            .addTerminalField('MONTHLY LIMITS',
                'Users can submit up to 3 nominations per month.\nLimits reset at the start of each month.')
            .addTerminalField('ALIASES',
                'You can also use !nominate or !nomination instead of !nominations')
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    }
};

module.exports = nominations;

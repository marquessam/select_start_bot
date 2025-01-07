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

            // Define admin-only subcommands
            const adminCommands = ['open', 'close'];
            
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

            switch(subcommand) {
                case 'view':
                    await this.handleView(message, shadowGame);
                    break;
                case 'add':
                    await this.handleAdd(message, args.slice(1));
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

    async showHelp(message) {
        // Check if user has admin permissions
        const isAdmin = message.member && (
            message.member.permissions.has('Administrator') ||
            message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)
        );

        // Base commands that everyone can see
        const baseCommands = 
            '!nominations view - View current nominations\n' +
            '!nominations add <platform> <game> - Submit a nomination';

        // Admin commands that only admins will see
        const adminCommands = 
            '\n!nominations open - Open nominations\n' +
            '!nominations close - Close nominations';

        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATION SYSTEM')
            .setTerminalDescription('[HELP MENU]')
            .addTerminalField('AVAILABLE COMMANDS',
                isAdmin ? baseCommands + adminCommands : baseCommands)
            .addTerminalField('VALID PLATFORMS', 
                'NES, SNES, GB, GBC, GBA, PSX, N64')
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

    async handleAdd(message, args) {
        if (args.length < 2) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !nominations add <platform> <game name>\n[Ready for input]█\x1b[0m```');
            return;
        }

        const nominationStatus = await database.getNominationStatus();
        if (!nominationStatus?.isOpen) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Nominations are currently closed\n[Ready for input]█\x1b[0m```');
            return;
        }

        const hasNominated = await database.hasUserNominated(message.author.id);
        if (hasNominated) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] You have already submitted a nomination this period\n[Ready for input]█\x1b[0m```');
            return;
        }

        const platform = args[0].toUpperCase();
        const validPlatforms = ['NES', 'SNES', 'GB', 'GBC', 'GBA', 'PSX', 'N64'];
        
        if (!validPlatforms.includes(platform)) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid platform. Valid platforms: NES, SNES, GB, GBC, GBA, PSX, N64\n[Ready for input]█\x1b[0m```');
            return;
        }

        const gameName = args.slice(1).join(' ');
        if (!gameName) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Please provide a game name\n[Ready for input]█\x1b[0m```');
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

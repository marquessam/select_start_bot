const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
    name: 'nominations',
    description: 'View or submit game nominations',
    async execute(message, args, { database, shadowGame }) {
        try {
            if (!args.length) {
                await this.showHelp(message);
                return;
            }

            const subcommand = args[0].toLowerCase();

            switch (subcommand) {
                case 'view':
                    await this.viewNominations(message, database, shadowGame);
                    break;
                case 'nominate':
                    if (args.length < 3) {
                        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !nominations nominate <platform> <game name>\n[Ready for input]█\x1b[0m```');
                        return;
                    }
                    await this.submitNomination(message, args.slice(1), database);
                    break;
                case 'open':
                    if (message.member.permissions.has('Administrator')) {
                        await this.openNominations(message, database);
                    } else {
                        await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                    }
                    break;
                case 'close':
                    if (message.member.permissions.has('Administrator')) {
                        await this.closeNominations(message, database);
                    } else {
                        await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                    }
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
        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATION SYSTEM')
            .setTerminalDescription('[HELP MENU]\n[AVAILABLE COMMANDS]')
            .addTerminalField('USAGE',
                '!nominations view - View current nominations\n' +
                '!nominations nominate <platform> <game> - Submit a nomination\n' +
                'Example: !nominations nominate SNES Super Mario World\n\n' +
                'Valid platforms: NES, SNES, GB, GBC, GBA, PSX, N64')
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    },

    async viewNominations(message, database, shadowGame) {
        await message.channel.send('```ansi\n\x1b[32m> Accessing nominations database...\x1b[0m\n```');
        
        try {
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

            // Group nominations by platform
            const groupedNominations = nominations.reduce((acc, nom) => {
                if (!acc[nom.platform]) acc[nom.platform] = [];
                acc[nom.platform].push(`${nom.game} (by ${nom.discordUsername})`);
                return acc;
            }, {});
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('NOMINATED TITLES')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING NOMINATIONS BY PLATFORM]');

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
        } catch (error) {
            console.error('View Nominations Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Unable to access nominations\n[Ready for input]█\x1b[0m```');
        }
    },

    async submitNomination(message, args, database) {
        try {
            // Check if nominations are open
            const nominationStatus = await database.getNominationStatus();
            if (!nominationStatus?.isOpen) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Nominations are currently closed\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Check if user has already nominated
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

            // Submit the nomination
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
        } catch (error) {
            console.error('Submit Nomination Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to submit nomination\n[Ready for input]█\x1b[0m```');
        }
    },

    async openNominations(message, database) {
        try {
            await database.setNominationStatus(true);
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('NOMINATIONS OPENED')
                .setTerminalDescription('[STATUS UPDATE SUCCESSFUL]')
                .addTerminalField('STATUS', 'Nominations are now open for submissions')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Open Nominations Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to open nominations\n[Ready for input]█\x1b[0m```');
        }
    },

    async closeNominations(message, database) {
        try {
            await database.setNominationStatus(false);
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('NOMINATIONS CLOSED')
                .setTerminalDescription('[STATUS UPDATE SUCCESSFUL]')
                .addTerminalField('STATUS', 'Nominations are now closed')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Close Nominations Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to close nominations\n[Ready for input]█\x1b[0m```');
        }
    }
};

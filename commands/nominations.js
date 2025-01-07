const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

module.exports = {
    name: 'nominations',
    description: 'Manage game nominations',
   async execute(message, args, { database, shadowGame }) {
    try {
        if (!args.length) {
            await this.showHelp(message);
            return;
        }

        const subcommand = args[0].toLowerCase();

        // Define admin-only subcommands
        const adminCommands = ['populate', 'open', 'close'];
        
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
                await this.viewNominations(message, database, shadowGame);
                break;
            case 'add':
                await this.submitNomination(message, args.slice(1), database);
                break;
            case 'populate':
                await this.handlePopulate(message);
                break;
            case 'open':
                await this.openNominations(message, database);
                break;
            case 'close':
                await this.closeNominations(message, database);
                break;
            default:
                await this.showHelp(message);
        }
    } catch (error) {
        console.error('Nominations Error:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Unable to process nomination command\n[Ready for input]█\x1b[0m```');
    }
}
};

async function showHelp(message) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('NOMINATION SYSTEM')
        .setTerminalDescription('[HELP MENU]')
        .addTerminalField('AVAILABLE COMMANDS',
            '!nominations view - View current nominations\n' +
            '!nominations add <platform> <game> - Submit a nomination\n' +
            '!nominations open - Open nominations (Admin)\n' +
            '!nominations close - Close nominations (Admin)\n' +
            '!nominations populate - Import predefined nominations (Admin)')
        .addTerminalField('VALID PLATFORMS', 
            'NES, SNES, GB, GBC, GBA, PSX, N64')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleView(message, shadowGame) {
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
}

async function handleAdd(message, args) {
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
}

async function handlePopulate(message) {
    const nominations = [
        { game: "Ape Escape", platform: "PSX" },
        { game: "Pokemon Emerald", platform: "GBA" },
        { game: "Crystalis", platform: "NES" },
        { game: "Xenogears", platform: "PSX" },
        { game: "Brigadine", platform: "PSX" },
        { game: "Mega Man Legends", platform: "PSX" },
        { game: "Metal Gear Solid", platform: "PSX" },
        { game: "Act Raiser", platform: "SNES" },
        { game: "Mega Man 2", platform: "SNES" },
        { game: "Super Bomberman", platform: "SNES" },
        { game: "Zelda: Ocarina of Time", platform: "N64" },
        { game: "Spyro the Dragon", platform: "PSX" },
        { game: "Castlevania: Bloodlines", platform: "Genesis" },
        { game: "Zelda: Majora's Mask", platform: "N64" },
        { game: "LOTR: Return of the King", platform: "GBA" },
        { game: "Harley's Humungous Adventure", platform: "SNES" },
        { game: "Zelda: Link to the Past", platform: "SNES" },
        { game: "Super Mario Land", platform: "GB" },
        { game: "Dragon Quest V", platform: "PS2" },
        { game: "Donkey Kong Country", platform: "SNES" },
        { game: "Advanced Wars", platform: "GBA" },
        { game: "Crash Bandicoot 3: Warped", platform: "PSX" },
        { game: "Castlevania: Symphony of the Night", platform: "PSX" },
        { game: "Glover", platform: "PSX" },
        { game: "Tail of the Sun", platform: "PSX" },
        { game: "Incredible Crisis", platform: "PSX" },
        { game: "Banjo-Kazooie", platform: "N64" },
        { game: "The Adventures of Batman & Robin", platform: "SNES" },
        { game: "Crash Team Racing", platform: "PSX" },
        { game: "Suikoden 2", platform: "PSX" },
        { game: "Pokemon Red/Blue", platform: "GB" },
        { game: "Harvest Moon: Back to Nature", platform: "PSX" },
        { game: "Croc: Legend of the Gobbos", platform: "PSX" }
    ];

    await database.setNominationStatus(true);

    const collection = await database.getCollection('nominations');
    const period = new Date().toISOString().slice(0, 7);
    
    await collection.updateOne(
        { _id: 'currentPeriod' },
        { $set: { period } },
        { upsert: true }
    );

    const nominationsWithDetails = nominations.map(nom => ({
        ...nom,
        discordId: 'legacy',
        discordUsername: 'Legacy Import',
        timestamp: new Date().toISOString()
    }));

    await collection.updateOne(
        { _id: 'nominations' },
        { 
            $set: { 
                [`nominations.${period}`]: nominationsWithDetails 
            } 
        },
        { upsert: true }
    );

    const embed = new TerminalEmbed()
        .setTerminalTitle('NOMINATIONS IMPORTED')
        .setTerminalDescription('[IMPORT SUCCESSFUL]')
        .addTerminalField('SUMMARY', 
            `Total nominations imported: ${nominations.length}\n` +
            `Current period: ${period}`)
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleOpen(message) {
    await database.setNominationStatus(true);
    
    const embed = new TerminalEmbed()
        .setTerminalTitle('NOMINATIONS OPENED')
        .setTerminalDescription('[STATUS UPDATE SUCCESSFUL]')
        .addTerminalField('STATUS', 'Nominations are now open for submissions')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

async function handleClose(message) {
    await database.setNominationStatus(false);
    
    const embed = new TerminalEmbed()
        .setTerminalTitle('NOMINATIONS CLOSED')
        .setTerminalDescription('[STATUS UPDATE SUCCESSFUL]')
        .addTerminalField('STATUS', 'Nominations are now closed')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

const TerminalEmbed = require('../utils/embedBuilder');

// Command to populate existing nominations
module.exports = {
    name: 'populatenoms',
    description: 'Populate existing nominations',
    async execute(message, args, { database }) {
        try {
            if (!message.member.permissions.has('Administrator')) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Predefined nominations
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

            // Open nominations if not already open
            await database.setNominationStatus(true);

            // Clear existing nominations for clean import
            const collection = await database.getCollection('nominations');
            await collection.updateOne(
                { _id: 'nominations' },
                { $set: { nominations: {} } },
                { upsert: true }
            );

            // Set current period
            const period = new Date().toISOString().slice(0, 7);
            await collection.updateOne(
                { _id: 'currentPeriod' },
                { $set: { period } },
                { upsert: true }
            );

            // Add all nominations
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

            // Create confirmation embed
            const embed = new TerminalEmbed()
                .setTerminalTitle('NOMINATIONS IMPORTED')
                .setTerminalDescription('[IMPORT SUCCESSFUL]')
                .addTerminalField('SUMMARY', 
                    `Total nominations imported: ${nominations.length}\n` +
                    `Current period: ${period}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Populate Nominations Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to populate nominations\n[Ready for input]█\x1b[0m```');
        }
    }
};

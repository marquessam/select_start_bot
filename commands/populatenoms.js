const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
    name: 'populatenoms',
    description: 'Populate existing nominations',
    async execute(message, args, { database }) {
        try {
            if (!message.member.permissions.has('Administrator')) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Importing nominations...\x1b[0m\n```');

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

            // Get the nominations collection
            const collection = await database.getCollection('nominations');

            // Set current period
            const period = new Date().toISOString().slice(0, 7);

            // Open nominations
            await database.setNominationStatus(true);

            // Clear existing nominations for this period
            await collection.updateOne(
                { _id: 'nominations' },
                { 
                    $set: { 
                        [`nominations.${period}`]: [] 
                    } 
                },
                { upsert: true }
            );

            // Add each nomination
            for (const nom of nominations) {
                await collection.updateOne(
                    { _id: 'nominations' },
                    {
                        $push: {
                            [`nominations.${period}`]: {
                                ...nom,
                                discordId: 'legacy',
                                discordUsername: 'Legacy Import',
                                timestamp: new Date().toISOString()
                            }
                        }
                    }
                );
            }

            // Update current period
            await collection.updateOne(
                { _id: 'currentPeriod' },
                { $set: { period } },
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

        } catch (error) {
            console.error('Populate Nominations Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to populate nominations\n[Ready for input]█\x1b[0m```');
        }
    }
};

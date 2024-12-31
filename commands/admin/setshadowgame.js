const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'setshadowgame',
    description: 'Initialize shadow game in database',
    async execute(message, args) {
        try {
            const shadowGameData = {
                active: true,
                currentProgress: 0,
                puzzles: [
                    {
                        error: "ERROR 0xCT01: Timeline database corrupted\nExpected value 'date.presentday.timeline' not found\nAttempting recovery of time marker...",
                        solution: "!1000AD",
                        completion_message: "[RECOVERED] Present day timeline restored\n[WARNING] Additional timeline anomaly detected in Middle Ages..."
                    },
                    {
                        error: "ERROR 0xCT02: Paradox detected in Middle Ages\nAnomalous dual existence: LEANNE.entity and MARLE.entity\nExpected value 'date.middleages.timeline' not found\nAttempting timeline calibration...",
                        solution: "!600AD",
                        completion_message: "[RECOVERED] Middle Ages timeline stabilized\n[WARNING] Future timeline corruption detected..."
                    },
                    {
                        error: "ERROR 0xCT03: Future systems critical\nLife support failing: DOME_NETWORK.status = CRITICAL\nExpected value 'date.futureapocalypse.timeline' corrupted\nAttempting emergency time sync...",
                        solution: "!2300AD",
                        completion_message: "[RECOVERED] Future timeline synchronized\n[WARNING] Day of Lavos temporal anomaly detected..."
                    },
                    {
                        error: "ERROR 0xCT04: LAVOS.emergence_date corrupted\nCatastrophic event timeline unstable\nExpected value 'date.lavos.timeline' not found\nAttempting temporal stabilization...",
                        solution: "!1999AD",
                        completion_message: "[RECOVERED] Day of Lavos timepoint restored\n[WARNING] Prehistoric data corruption detected..."
                    },
                    {
                        error: "ERROR 0xCT05: Prehistoric database overflow\nAEON.sys temporal boundary exceeded\nExpected value 'prehistory.timeline' not found\nAttempting primitive era recovery...",
                        solution: "!65000000BC",
                        completion_message: "[RECOVERED] Prehistoric era restored\n[SUCCESS] All temporal anomalies resolved\n[ACCESSING HIDDEN DATA...]"
                    }
                ],
                finalReward: {
                    gameId: "9999",
                    gameName: "[TEMPORAL ANOMALY RESOLVED]",
                    points: 2
                }
            };

            // Save to database
            await database.saveShadowGame(shadowGameData);

            // Verify data was saved
            const savedData = await database.getShadowGame();

            const embed = new TerminalEmbed()
                .setTerminalTitle('SHADOW GAME INITIALIZED')
                .setTerminalDescription('[DATABASE UPDATE COMPLETE]\n[SHADOW SYSTEM CONFIGURED]')
                .addTerminalField('VERIFICATION', 
                    `Active: ${savedData.active}\n` +
                    `Puzzles: ${savedData.puzzles.length}\n` +
                    `Current Progress: ${savedData.currentProgress}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !shadowreset to begin the game\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Set Shadow Game Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to initialize shadow game\n[Ready for input]█\x1b[0m```');
        }
    }
};

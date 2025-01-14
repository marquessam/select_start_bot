// commands/admin/shadowinit.js

module.exports = {
    name: 'shadowinit',
    category: 'admin',
    description: 'Initialize or reinitialize the shadow game',
    permissions: ['ADMINISTRATOR'],
    
    async execute(message, args) {
        try {
            const shadowGameData = {
                active: true,
                currentProgress: 0,
                puzzles: [
                    {
                        error: "ERROR 0xCT01: Timeline database corrupted\nExpected value 'date.presentday.timeline' not found\nAttempting recovery of time marker...\n\n\x1b[37mPlease input !<year> to continue\x1b[0m",
                        solution: "!1000AD",
                        completion_message: "[RECOVERED] Present day timeline restored\n[WARNING] Additional timeline anomaly detected in Middle Ages..."
                    },
                    {
                        error: "ERROR 0xCT02: Paradox detected in Middle Ages\nAnomalous dual existence: LEANNE.entity and MARLE.entity\nExpected value 'date.middleages.timeline' not found\nAttempting timeline calibration...\n\n\x1b[37mPlease input !<year> to continue\x1b[0m",
                        solution: "!600AD",
                        completion_message: "[RECOVERED] Middle Ages timeline stabilized\n[WARNING] Future timeline corruption detected..."
                    },
                    {
                        error: "ERROR 0xCT03: Future systems critical\nLife support failing: DOME_NETWORK.status = CRITICAL\nExpected value 'date.futureapocalypse.timeline' corrupted\nAttempting emergency time sync...\n\n\x1b[37mPlease input !<year> to continue\x1b[0m",
                        solution: "!2300AD",
                        completion_message: "[RECOVERED] Future timeline synchronized\n[WARNING] Day of Lavos temporal anomaly detected..."
                    },
                    {
                        error: "ERROR 0xCT04: LAVOS.emergence_date corrupted\nCatastrophic event timeline unstable\nExpected value 'date.lavos.timeline' not found\nAttempting temporal stabilization...\n\n\x1b[37mPlease input !<year> to continue\x1b[0m",
                        solution: "!1999AD",
                        completion_message: "[RECOVERED] Day of Lavos timepoint restored\n[WARNING] Prehistoric data corruption detected..."
                    },
                    {
                        error: "ERROR 0xCT05: Prehistoric database overflow\nAEON.sys temporal boundary exceeded\nExpected value 'prehistory.timeline' not found\nAttempting primitive era recovery...\n\n\x1b[37mPlease input !<year> to continue\x1b[0m",
                        solution: "!65000000BC",
                        completion_message: "[RECOVERED] Prehistoric era restored\n[SUCCESS] All temporal anomalies resolved\n[ACCESSING HIDDEN DATA...]"
                    }
                ],
                finalReward: {
                    gameId: "10024",
                    gameName: "Mario Tennis",
                    points: "1st/2nd/3rd - 3/2/1"
                }
            };

            const { shadowGame } = args.context;
            await shadowGame.initialize(shadowGameData);

            await message.channel.send('```ansi\n\x1b[32mShadow game initialized successfully.\nUse !shadowreset to begin the game.\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Shadow Init Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to initialize shadow game\n[Ready for input]█\x1b[0m```');
        }
    }
};

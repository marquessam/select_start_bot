// setchallenge.js
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'setchallenge',
    description: 'Set up the current monthly challenge',
    async execute(message, args) {
        try {
            if (args.length < 5) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !setchallenge <gameId> <gameName> <gameIcon> <startDate> <endDate>\nExample: !setchallenge 319 "Chrono Trigger" /Images/093950.png 2025-01-01 2025-01-31\n[Ready for input]█\x1b[0m```');
                return;
            }

            const [gameId, ...restArgs] = args;
            const endDate = restArgs.pop();
            const startDate = restArgs.pop();
            const gameIcon = restArgs.pop();
            const gameName = restArgs.join(' ').replace(/"/g, '');

            const challengeData = {
                gameId,
                gameName,
                gameIcon,
                startDate,
                endDate,
                rules: [
                    "Hardcore mode must be enabled",
                    "All achievements are eligible",
                    "Progress tracked via retroachievements",
                    "No hacks/save states/cheats allowed"
                ],
                points: {
                    first: 6,
                    second: 4,
                    third: 2
                }
            };

            await database.saveCurrentChallenge(challengeData);

            const embed = new TerminalEmbed()
                .setTerminalTitle('CHALLENGE UPDATED')
                .setTerminalDescription('[UPDATE SUCCESSFUL]\n[NEW CHALLENGE SET]')
                .addTerminalField('DETAILS', 
                    `GAME ID: ${gameId}\n` +
                    `GAME NAME: ${gameName}\n` +
                    `ICON: ${gameIcon}\n` +
                    `START: ${startDate}\n` +
                    `END: ${endDate}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !challenge to verify update\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Set Challenge Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to update challenge\n[Ready for input]█\x1b[0m```');
        }
    }
};

// commands/challenge.js
const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

module.exports = {
    name: 'challenge',
    description: 'Shows current monthly challenge and shadow game status',
    async execute(message, args, { shadowGame }) {
        try {
            // Fetch current challenge data
            const currentChallenge = await database.getCurrentChallenge();
            const shadowGameData = await database.getShadowGame();

            const embed = new TerminalEmbed()
                .setTerminalTitle('CURRENT CHALLENGES')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]');

            // Add monthly challenge info
            if (currentChallenge && currentChallenge.gameId) {
                embed.addTerminalField('MONTHLY CHALLENGE',
                    `GAME: ${currentChallenge.gameName}\n` +
                    `DATES: ${currentChallenge.startDate} to ${currentChallenge.endDate}\n\n` +
                    `POINTS AVAILABLE:\n` +
                    `- Participation: 1 point\n` +
                    `- Game Completion: 3 points\n` +
                    `- Mastery: 3 points\n\n` +
                    `RULES:\n${currentChallenge.rules.map(rule => `> ${rule}`).join('\n')}`
                );

                if (currentChallenge.gameIcon) {
                    embed.setThumbnail(`https://retroachievements.org${currentChallenge.gameIcon}`);
                }
            } else {
                embed.addTerminalField('MONTHLY CHALLENGE', 'No active challenge found');
            }

            // Add shadow game info
            if (!shadowGameData || !shadowGameData.active) {
                embed.addTerminalField('SHADOW CHALLENGE', 
                    '```ansi\n\x1b[33m[DATA CORRUPTED]\nNo hidden challenge detected...\x1b[0m```');
            } else if (shadowGameData.finalReward && shadowGameData.triforceState?.power?.collected) {
                // Shadow game discovered (triforce completed)
                embed.addTerminalField('SHADOW CHALLENGE',
                    `GAME: ${shadowGameData.finalReward.gameName}\n` +
                    `POINTS AVAILABLE:\n` +
                    `- Participation: ${shadowGameData.finalReward.points.participation} point\n` +
                    `- Game Completion: ${shadowGameData.finalReward.points.beaten} points\n\n` +
                    `This challenge can be completed alongside the monthly challenge.`
                );
            } else if (shadowGameData.triforceState) {
                // Triforce hunt in progress
                const wisdom = shadowGameData.triforceState.wisdom;
                const courage = shadowGameData.triforceState.courage;
                
                embed.addTerminalField('SACRED REALM',
                    '```ansi\n\x1b[33m' +
                    'The sacred triangles remain scattered...\n\n' +
                    `Triforce of Wisdom: ${wisdom.found}/${wisdom.required} pieces restored\n` +
                    `Triforce of Courage: ${courage.found}/${courage.required} pieces restored\n` +
                    `Triforce of Power: ${shadowGameData.triforceState.power.collected ? 'Reclaimed' : 'Held by Ganon'}` +
                    '\x1b[0m```'
                );
            } else {
                embed.addTerminalField('SHADOW CHALLENGE',
                    '```ansi\n\x1b[31m[ACCESS DENIED]\nShadow data inaccessible\x1b[0m```');
            }

            // Set footer with timestamp
            embed.setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Challenge Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve challenge data\n[Ready for input]█\x1b[0m```');
        }
    }
};

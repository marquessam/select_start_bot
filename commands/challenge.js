    // commands/challenge.js
const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

module.exports = {
    name: 'challenge',
    description: 'Shows current monthly challenge and shadow game status',
    async execute(message, args, { shadowGame }) {
        try {
            const currentChallenge = await database.getCurrentChallenge();
            const shadowGameData = await database.getShadowGame();

            const embed = new TerminalEmbed()
                .setTerminalTitle('CURRENT CHALLENGES')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]');

            // Add monthly challenge info
            if (currentChallenge && currentChallenge.gameId) {
                embed.addTerminalField('MONTHLY CHALLENGE',
                    `GAME: "${currentChallenge.gameName}"\n` +
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

            // Enhanced shadow game display
        if (shadowGameData && shadowGameData.triforceState?.power?.collected) {
            // Shadow game is unlocked - show parallel challenge
            embed.addTerminalField('SHADOW CHALLENGE UNLOCKED',
                `GAME: ${shadowGameData.finalReward.gameName} (${shadowGameData.finalReward.platform})\n\n` +
                `REWARDS:\n` +
                `Mark of Participation: 1 sacred point\n` +
                `Mark of Completion: 3 sacred points\n\n` +
                `This challenge runs parallel to your current quest.`
            );
        } else if (!shadowGameData || !shadowGameData.active) {
            // No shadow game active
            embed.addTerminalField('THE SACRED REALM', 
                '```ansi\n\x1b[33m' +
                'An ancient power stirs in the shadows...\n' +
                'But its presence remains hidden.\n' +
                '\x1b[0m```');
        } else if (shadowGameData.triforceState) {
                // Triforce hunt active
                const wisdom = shadowGameData.triforceState.wisdom;
                const courage = shadowGameData.triforceState.courage;
                
                embed.addTerminalField('THE SACRED REALM',
                    '```ansi\n\x1b[33m' +
                    'The sacred triangles lie scattered across our realm...\n\n' +
                    `TRIFORCE OF WISDOM\n` +
                    `${wisdom.found}/${wisdom.required} fragments restored\n\n` +
                    `TRIFORCE OF COURAGE\n` +
                    `${courage.found}/${courage.required} fragments restored\n\n` +
                    `TRIFORCE OF POWER\n` +
                    `Status: ${shadowGameData.triforceState.power.collected ? 'Reclaimed from darkness' : 'Still held by Ganon...'}\n` +
                    '\x1b[0m```'
                );

                if (wisdom.found === wisdom.required && 
                    courage.found === courage.required && 
                    !shadowGameData.triforceState.power.collected) {
                    embed.addTerminalField('ANCIENT PROPHECY',
                        '```ansi\n\x1b[33m' +
                        'Wisdom and Courage shine with sacred light!\n' +
                        'But darkness still grips the Triforce of Power...\n' +
                        'Only by defeating Ganon can the final piece be claimed.\n\n' +
                        'Face your destiny, hero...\n' +
                        '\x1b[0m```'
                    );
                }
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Challenge Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve challenge data\n[Ready for input]█\x1b[0m```');
        }
    }
};

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

            // Shadow game display based on revealed status
            if (shadowGameData && shadowGameData.revealed) {
                // Shadow game is unlocked - show the game info
                embed.addTerminalField('SHADOW CHALLENGE UNLOCKED',
                    `GAME: ${shadowGameData.finalReward.gameName} (${shadowGameData.finalReward.platform})\n\n` +
                    `POINTS AVAILABLE:\n` +
                    `Participation: 1 point\n` +
                    `Completion: 3 points\n\n` +
                    `This challenge runs parallel to your current quest.`
                );
            } else {
                // Shadow game is hidden
                embed.addTerminalField('SHADOW CHALLENGE', 
                    '```ansi\n\x1b[33m' +
                    'An ancient power stirs in the shadows...\n' +
                    'But its presence remains hidden.\n\n' +
                    'Use !shadowgame to attempt to unveil the challenge.\n' +
                    '\x1b[0m```');
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Challenge Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve challenge data\n[Ready for input]█\x1b[0m```');
        }
    }
};

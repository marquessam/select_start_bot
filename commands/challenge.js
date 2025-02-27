// commands/challenge.js
const { EmbedBuilder } = require('discord.js');
const database = require('../database');

module.exports = {
    name: 'challenge',
    description: 'Shows current monthly challenge and shadow game status',
    async execute(message, args, { shadowGame }) {
        try {
            const currentChallenge = await database.getCurrentChallenge();
            const shadowGameData = await database.getShadowGame();

            const embed = new EmbedBuilder()
                .setColor('#32CD32')  // Lime green color
                .setTitle('CURRENT CHALLENGES')
                .setDescription('**[DATABASE ACCESS GRANTED]**');

            // Add monthly challenge info
            if (currentChallenge && currentChallenge.gameId) {
                let challengeText = 
                    `**GAME:** "${currentChallenge.gameName}"\n` +
                    `**DATES:** ${currentChallenge.startDate} to ${currentChallenge.endDate}\n\n` +
                    `**POINTS AVAILABLE:**\n` +
                    `- Participation: 1 point\n` +
                    `- Game Completion: 3 points\n` +
                    `- Mastery: 3 points\n\n` +
                    `**RULES:**\n${currentChallenge.rules.map(rule => `> ${rule}`).join('\n')}`;
                
                embed.addFields({ name: 'MONTHLY CHALLENGE', value: challengeText });

                if (currentChallenge.gameIcon) {
                    embed.setThumbnail(`https://retroachievements.org${currentChallenge.gameIcon}`);
                }
            } else {
                embed.addFields({ name: 'MONTHLY CHALLENGE', value: 'No active challenge found' });
            }

            // Shadow game display based on revealed status
            if (shadowGameData && shadowGameData.revealed) {
                // Shadow game is unlocked - show the game info
                let shadowText = 
                    `**GAME:** ${shadowGameData.finalReward.gameName} (${shadowGameData.finalReward.platform})\n\n` +
                    `**POINTS AVAILABLE:**\n` +
                    `- Participation: 1 point\n` +
                    `- Completion: 3 points\n\n` +
                    `This challenge runs parallel to your current quest.`;
                
                embed.addFields({ name: 'SHADOW CHALLENGE UNLOCKED', value: shadowText });
            } else {
                // Shadow game is hidden
                let shadowText = 
                    `*An ancient power stirs in the shadows...*\n` +
                    `*But its presence remains hidden.*\n\n` +
                    `Use \`!shadowgame\` to attempt to unveil the challenge.`;
                
                embed.addFields({ name: 'SHADOW CHALLENGE', value: shadowText });
            }

            embed.setFooter({ text: `TERMINAL_ID: ${generateTerminalId()}` });
            embed.setTimestamp();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Challenge Command Error:', error);
            await message.channel.send('**[ERROR]** Failed to retrieve challenge data');
        }
    }
};

// Helper function to generate a random terminal ID
function generateTerminalId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 7; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

module.exports = {
    name: 'challenge',
    description: 'Displays current monthly challenge and ways to earn points',
    async execute(message, args, { shadowGame }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing challenge database...\x1b[0m\n```');
            
            // Get current challenge from database
            const currentChallenge = await database.getCurrentChallenge();
            
            if (!currentChallenge || !currentChallenge.gameId) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No active challenge found\n[Ready for input]█\x1b[0m```');
                return;
            }

            const embed = new TerminalEmbed()
                .setTerminalTitle('MONTHLY CHALLENGE')
                .setURL(`https://retroachievements.org/game/${currentChallenge.gameId}`)
                .setThumbnail(`https://retroachievements.org${currentChallenge.gameIcon}`)
                .setTerminalDescription('[STATUS: ACTIVE]\n[DATA VERIFIED]')
                .addTerminalField('CURRENT CHALLENGE', currentChallenge.gameName)
                .addTerminalField('CHALLENGE TIMEFRAME', 
                    `${currentChallenge.startDate} - ${currentChallenge.endDate}`)
                .addTerminalField('CHALLENGE PARAMETERS', 
                    currentChallenge.rules.map(rule => `> ${rule}`).join('\n'))
                .addTerminalField('REWARD PROTOCOL',
                    `> 🥇 ${currentChallenge.points.first} pts\n` +
                    `> 🥈 ${currentChallenge.points.second} pts\n` +
                    `> 🥉 ${currentChallenge.points.third} pts`)
                // Additional information about Monthly Challenge and Shadow Game
                .addTerminalField('ABOUT THE CHALLENGES',
                    `**Monthly Challenge:** A community-voted game each month where players compete to earn the most RetroAchievements.\n` +
                    `**Shadow Game Challenge:** A hidden challenge that is unlocked by interacting with the community/website/bot in unique ways each month. Once one user discovers it, it becomes available to the entire community.`)
                // Additional Ways to Earn Points
                .addTerminalField('HOW TO EARN POINTS',
                    `**Monthly Challenge & Shadow Games:**\n` +
                    `- 1 point for participating (earning a single achievement).\n` +
                    `- 3 points for beating the game.\n` +
                    `- Mastery in the monthly challenge grants 3 points, achievable any time during the year.\n` +
                    `- Points for shadow games (participation/beating) are only available during the month they're active.\n\n` +
                    `**Profile Linking & Membership:**\n` +
                    `- 1 point for linking your Discord and RetroAchievements profiles.\n` +
                    `- 1 point for being a Beta member.`)
                .setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !leaderboard to view current rankings\n[Ready for input]█\x1b[0m```');
            
            // Try to show shadow game error if applicable
            await shadowGame.tryShowError(message);
            
        } catch (error) {
            console.error('Challenge Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Mission data inaccessible\n[Ready for input]█\x1b[0m```');
        }
    }
};

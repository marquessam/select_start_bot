import TerminalEmbed = require('../utils/embedBuilder.js');
import database = require('../database');

export default {
    name: 'challenge',
    description: 'Displays current monthly challenge',
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

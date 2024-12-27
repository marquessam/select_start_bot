const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
    name: 'yearlyboard',
    description: 'Displays yearly rankings',
    async execute(message, args, { userStats }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');
            
            const leaderboard = await userStats.getYearlyLeaderboard();
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('YEARLY RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

            // Format all participants
            const leaderboardText = leaderboard
                .map((user, index) => `${index + 1}. ${user.username}: ${user.points} points`)
                .join('\n');

            // Split into multiple fields if needed (Discord's 1024 character limit per field)
            const chunks = [];
            let currentChunk = '';
            
            leaderboardText.split('\n').forEach(line => {
                if (currentChunk.length + line.length + 1 > 1000) {
                    chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk += (currentChunk ? '\n' : '') + line;
                }
            });
            if (currentChunk) chunks.push(currentChunk);

            // Add each chunk as a separate field
            chunks.forEach((chunk, index) => {
                embed.addTerminalField(
                    index === 0 ? 'RANKINGS' : 'RANKINGS (CONTINUED)',
                    chunk
                );
            });

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Yearly Rankings Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly rankings\n[Ready for input]█\x1b[0m```');
        }
    }
};

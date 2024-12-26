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

            const top10 = leaderboard.slice(0, 10);
            const leaderboardText = top10
                .map((user, index) => `${index + 1}. ${user.username}: ${user.points} points`)
                .join('\n');

            embed.addTerminalField('TOP OPERATORS', leaderboardText)
                .setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Yearly Rankings Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly rankings\n[Ready for input]█\x1b[0m```');
        }
    }
};

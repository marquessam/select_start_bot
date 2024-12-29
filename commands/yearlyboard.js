const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
    name: 'yearlyboard',
    description: 'Displays yearly rankings',
    async execute(message, args, { userStats }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');
            
            // Get valid users and yearly leaderboard
            const validUsers = await userStats.getAllUsers();
            const leaderboard = await userStats.getYearlyLeaderboard();
            
            // Filter leaderboard to only include valid users
            const filteredLeaderboard = leaderboard.filter(user => 
                validUsers.includes(user.username.toLowerCase())
            );
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('YEARLY RANKINGS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]');

            if (filteredLeaderboard.length > 0) {
                embed.addTerminalField('TOP OPERATORS',
                    filteredLeaderboard
                        .map((user, index) => `${index + 1}. ${user.username}: ${user.points} points`)
                        .join('\n'));
            } else {
                embed.addTerminalField('STATUS', 'No rankings available');
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Yearly Rankings Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly rankings\n[Ready for input]█\x1b[0m```');
        }
    }
};

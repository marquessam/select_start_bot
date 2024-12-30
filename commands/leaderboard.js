const TerminalEmbed = require('../utils/embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');

module.exports = {
    name: 'leaderboard',
    description: 'Displays current achievement rankings',
    async execute(message, args, { shadowGame }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing achievement database...\x1b[0m\n```');
            
            const data = await fetchLeaderboardData();
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('USER RANKINGS')
                .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]');

            // Display top 3 with medals
            data.leaderboard.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                embed.addTerminalField(
                    `${medals[index]} ${user.username}`,
                    `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\nPROGRESS: ${user.completionPercentage}%`
                );
            });

            // Additional participants with rank numbers
            const additionalUsers = data.leaderboard.slice(3);
            if (additionalUsers.length > 0) {
                const additionalRankings = additionalUsers
                    .map((user, index) => 
                        `${index + 4}. ${user.username} (${user.completionPercentage}%)`
                    )
                    .join('\n');
                    
                embed.addTerminalField(
                    'ADDITIONAL PARTICIPANTS',
                    additionalRankings
                );
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\n[Ready for input]█\x1b[0m```');
            await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Database sync failed\n[Ready for input]█\x1b[0m```');
        }
    }
};

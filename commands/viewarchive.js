const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
    name: 'viewarchive',
    description: 'View archived leaderboard data',
    async execute(message, args, { userStats }) {
        try {
            if (args.length < 1) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !viewarchive <month>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const month = args[0];
            await message.channel.send('```ansi\n\x1b[32m> Accessing archived data...\x1b[0m\n```');
            
            const archive = await userStats.getMonthlyArchive(month);
            
            if (!archive) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No archive found for ' + month + '\n[Ready for input]█\x1b[0m```');
                return;
            }

            const embed = new TerminalEmbed()
                .setTerminalTitle(`ARCHIVED RANKINGS: ${month.toUpperCase()}`)
                .setThumbnail(`https://retroachievements.org${archive.gameInfo.ImageIcon}`)
                .setTerminalDescription('[ARCHIVE ACCESS GRANTED]\n[DISPLAYING HISTORICAL DATA]');

            // Display top 3 with medals
            archive.rankings.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                embed.addTerminalField(
                    `${medals[index]} ${user.username}`,
                    `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\nPROGRESS: ${user.completionPercentage}%`
                );
            });

            // Additional participants
            const additionalUsers = archive.rankings.slice(3);
            if (additionalUsers.length > 0) {
                embed.addTerminalField(
                    'ADDITIONAL PARTICIPANTS',
                    additionalUsers.map(user => user.username).join(', ')
                );
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Archive data retrieved successfully\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('View Archive Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve archive\n[Ready for input]█\x1b[0m```');
        }
    }
};

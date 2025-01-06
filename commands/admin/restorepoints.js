const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'restorepoints',
    description: 'Restore points for beta members',
    
    async execute(message, args, { userStats }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Restoring beta member points...\x1b[0m\n```');

            const betaRoleId = '1301710526535041105';
            const betaRole = message.guild.roles.cache.get(betaRoleId);
            
            if (!betaRole) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Beta role not found\n[Ready for input]█\x1b[0m```');
                return;
            }

            const betaMembers = betaRole.members;
            const processedUsers = [];
            const failedUsers = [];

            for (const [memberId, member] of betaMembers) {
                try {
                    // Get user's nickname or username
                    const username = member.nickname || member.user.username;
                    
                    // Award the point
                    await userStats.addBonusPoints(
                        username,
                        1,
                        'Beta Program Participation'
                    );
                    
                    processedUsers.push(username);
                } catch (error) {
                    console.error(`Error processing user ${member.user.username}:`, error);
                    failedUsers.push(member.user.username);
                }
            }

            // Create response embed
            const embed = new TerminalEmbed()
                .setTerminalTitle('BETA POINTS RESTORATION')
                .setTerminalDescription('[PROCESS COMPLETE]\n[DISPLAYING RESULTS]');

            if (processedUsers.length > 0) {
                embed.addTerminalField('POINTS RESTORED TO', processedUsers.join('\n'));
            }

            if (failedUsers.length > 0) {
                embed.addTerminalField('FAILED TO PROCESS', failedUsers.join('\n'));
            }

            embed.addTerminalField('SUMMARY', 
                `Successfully processed: ${processedUsers.length}\n` +
                `Failed to process: ${failedUsers.length}`
            );

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error in restorepoints command:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to restore points\n[Ready for input]█\x1b[0m```');
        }
    },
};

// commands/admin/resetpoints.js

const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'resetpoints',
    description: 'Clear and repopulate all points',
    async execute(message, args, { pointsManager, userStats }) {
        try {
            // First, notify about the operation
            await message.channel.send('```ansi\n\x1b[32m> Initiating points reset...\x1b[0m\n```');

            const embed = new TerminalEmbed()
                .setTerminalTitle('POINTS RESET INITIATED')
                .setTerminalDescription('[PROCESSING]\n[THIS MAY TAKE A FEW MINUTES]');
            
            const statusMessage = await message.channel.send({ embeds: [embed] });

            // Pause the achievement feed
            if (global.achievementFeed) {
                global.achievementFeed.isPaused = true;
                embed.addTerminalField('STATUS', 'Achievement feed paused');
                await statusMessage.edit({ embeds: [embed] });
            }

            // Clear points collection
            const collection = await pointsManager.database.getCollection('bonusPoints');
            await collection.deleteMany({});

            // Update status
            embed.addTerminalField('STATUS', 'Points cleared. Beginning recheck...');
            await statusMessage.edit({ embeds: [embed] });

            // Recheck all points
            const result = await userStats.recheckAllPoints(message.guild);

            // Resume the achievement feed
            if (global.achievementFeed) {
                global.achievementFeed.isPaused = false;
            }

            // Show results
            embed
                .setTerminalDescription('[RESET COMPLETE]')
                .addTerminalField('RESULTS',
                    `Users Processed: ${result.processed.length}\n` +
                    `Errors: ${result.errors.length}\n` +
                    'Achievement feed resumed'
                );

            if (result.errors.length > 0) {
                embed.addTerminalField('ERRORS',
                    result.errors.map(e => 
                        `${e.username}: ${e.error}`
                    ).join('\n')
                );
            }

            embed.setTerminalFooter();
            await statusMessage.edit({ embeds: [embed] });

            // Force leaderboard update
            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

        } catch (error) {
            console.error('Reset Points Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reset points\n[Ready for input]█\x1b[0m```');
            
            // Make sure to resume the feed even if there's an error
            if (global.achievementFeed) {
                global.achievementFeed.isPaused = false;
            }
        }
    }
};

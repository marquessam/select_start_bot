// commands/admin/cleanuppoints.js

const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'cleanuppoints',
    description: 'Clean up duplicate points',
    async execute(message, args, { pointsManager }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Starting points cleanup...\x1b[0m\n```');

            const collection = await pointsManager.database.getCollection('bonusPoints');
            const year = new Date().getFullYear().toString();

            // First, get all points
            const allPoints = await collection.find({
                year: year
            }).toArray();

            // Group points by user and game
            const groupedPoints = new Map();
            
            for (const point of allPoints) {
                const key = `${point.username}-${point.gameId || 'nogame'}-${point.reason}`;
                if (!groupedPoints.has(key)) {
                    groupedPoints.set(key, []);
                }
                groupedPoints.get(key).push(point);
            }

            // Find and remove duplicates
            let removedCount = 0;
            let processedUsers = new Set();

            for (const [key, points] of groupedPoints) {
                if (points.length > 1) {
                    // Sort by date, keep newest
                    points.sort((a, b) => new Date(b.date) - new Date(a.date));
                    
                    // Remove all but the newest
                    const toRemove = points.slice(1);
                    await collection.deleteMany({
                        _id: { $in: toRemove.map(p => p._id) }
                    });

                    removedCount += toRemove.length;
                    processedUsers.add(points[0].username);
                }
            }

            const embed = new TerminalEmbed()
                .setTerminalTitle('POINTS CLEANUP')
                .setTerminalDescription('[CLEANUP COMPLETE]')
                .addTerminalField('RESULTS',
                    `Duplicates Removed: ${removedCount}\n` +
                    `Users Affected: ${processedUsers.size}`
                );

            if (processedUsers.size > 0) {
                embed.addTerminalField('AFFECTED USERS',
                    Array.from(processedUsers).join(', ')
                );
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });

            // Force leaderboard update if duplicates were found
            if (removedCount > 0 && global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

        } catch (error) {
            console.error('Points Cleanup Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to cleanup points\n[Ready for input]█\x1b[0m```');
        }
    }
};

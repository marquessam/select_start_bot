// commands/admin/migratepoints.js

const TerminalEmbed = require('../../utils/embedBuilder');
const AchievementSystem = require('../../achievementSystem');

module.exports = {
    name: 'migratepoints',
    description: 'Migrate bonus points to achievement records',
    async execute(message, args) {
        try {
            const statusEmbed = new TerminalEmbed()
                .setTerminalTitle('POINTS MIGRATION')
                .setTerminalDescription('[MIGRATION IN PROGRESS]');
            
            const statusMessage = await message.channel.send({ embeds: [statusEmbed] });

            // Get the database instance
            const db = message.client.database;  // Make sure this is accessible
            
            // Get all existing bonus points
            const bonusPoints = await db.getCollection('bonusPoints').find({}).toArray();
            
            statusEmbed.addTerminalField('STATUS', 
                `Found ${bonusPoints.length} points to migrate\nProcessing...`
            );
            await statusMessage.edit({ embeds: [statusEmbed] });

            // Group points by unique combinations
            const grouped = bonusPoints.reduce((acc, point) => {
                const key = `${point.username}-${point.gameId || 'none'}-${point.pointType}`;
                if (!acc[key]) {
                    acc[key] = [];
                }
                acc[key].push(point);
                return acc;
            }, {});

            // Keep only the newest point for each group
            const uniquePoints = Object.values(grouped).map(points => 
                points.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
            );

            // Convert to new format
            const records = uniquePoints.map(point => ({
                username: point.username.toLowerCase(),
                gameId: point.gameId || null,
                type: point.pointType,
                date: point.date,
                year: point.year,
                migratedFrom: {
                    originalId: point._id,
                    reason: point.reason
                }
            })).filter(record => 
                record.gameId && 
                Object.values(AchievementSystem.Types).includes(record.type)
            );

            statusEmbed.addTerminalField('PROCESSING', 
                `Consolidated ${bonusPoints.length} points into ${records.length} unique achievements`
            );
            await statusMessage.edit({ embeds: [statusEmbed] });

            // Backup old points
            const backupCollection = db.getCollection('bonusPoints_backup');
            await backupCollection.insertMany(bonusPoints);

            // Insert new records
            if (records.length > 0) {
                const achievementRecords = db.getCollection('achievement_records');
                await achievementRecords.insertMany(records);
            }

            statusEmbed
                .setTerminalDescription('[MIGRATION COMPLETE]')
                .addTerminalField('RESULTS',
                    `✓ ${records.length} achievement records created\n` +
                    `✓ ${bonusPoints.length} original points backed up\n` +
                    'Migration completed successfully'
                )
                .setTerminalFooter();

            await statusMessage.edit({ embeds: [statusEmbed] });

            // Force leaderboard update
            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

        } catch (error) {
            console.error('Migration Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Migration failed. Check logs for details.\n[Ready for input]█\x1b[0m```');
        }
    }
};

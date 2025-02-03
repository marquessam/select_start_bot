// commands/admin/repopulatepoints.js

const TerminalEmbed = require('../../utils/embedBuilder');
const { fetchHistoricalProgress } = require('../../raAPI');
const AchievementSystem = require('../../achievementSystem');

module.exports = {
    name: 'repopulatepoints',
    description: 'Repopulate achievement records from RetroAchievements profiles',
    async execute(message, args, { userTracker }) {
        try {
            const statusEmbed = new TerminalEmbed()
                .setTerminalTitle('ACHIEVEMENT REPOPULATION')
                .setTerminalDescription('[PROCESS STARTING]');
            
            const statusMessage = await message.channel.send({ embeds: [statusEmbed] });

            // Get all valid users
            const users = await userTracker.getValidUsers();

            statusEmbed.addTerminalField('STATUS', 
                `Found ${users.length} users to process\n` +
                'Fetching achievement data...'
            );
            await statusMessage.edit({ embeds: [statusEmbed] });

            // Clear existing achievement records
            const db = message.client.database;
            await db.getCollection('achievement_records').deleteMany({});

            // Get tracked game IDs
            const gameIds = Object.keys(AchievementSystem.Games);

            // Fetch all historical progress for all users
            const progressData = await fetchHistoricalProgress(users, gameIds);
            
            let processed = 0;
            let totalAchievements = 0;
            const achievementSystem = new AchievementSystem(db);

            // Process each user
            for (const username of users) {
                const userProgress = progressData.get(username);
                if (!userProgress) continue;

                // Process each game's achievements
                for (const [gameId, achievements] of userProgress.entries()) {
                    await achievementSystem.checkAchievements(username, achievements, gameId);
                }

                processed++;
                // Update status every 5 users
                if (processed % 5 === 0) {
                    statusEmbed.addTerminalField('PROGRESS', 
                        `Processed ${processed}/${users.length} users\n` +
                        `Total achievements recorded: ${totalAchievements}`
                    );
                    await statusMessage.edit({ embeds: [statusEmbed] });
                }
            }

            // Get final counts
            const finalCount = await db.getCollection('achievement_records').countDocuments();

            statusEmbed
                .setTerminalDescription('[REPOPULATION COMPLETE]')
                .addTerminalField('FINAL RESULTS',
                    `✓ ${processed} users processed\n` +
                    `✓ ${finalCount} achievement records created\n` +
                    'Repopulation completed successfully'
                )
                .setTerminalFooter();

            await statusMessage.edit({ embeds: [statusEmbed] });

            // Force leaderboard update
            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

        } catch (error) {
            console.error('Repopulation Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Repopulation failed. Check logs for details.\n[Ready for input]█\x1b[0m```');
        }
    }
};

// achievementTracker.js
const { withTransaction } = require('./utils/transactions');

class AchievementTracker {
    constructor(database) {
        this.database = database;
    }

    async updateUserProgress(username, gameId, achievements) {
        try {
            return await withTransaction(this.database, async (session) => {
                // 1. Get game config and total achievements
                const gameConfig = this.getGameConfig(gameId);
                if (!gameConfig) return null;

                // 2. Calculate progress
                const totalAchievements = achievements.length;
                const progress = {
                    completed: achievements.filter(a => a.DateEarned).length,
                    total: totalAchievements,
                    percentage: ((achievements.filter(a => a.DateEarned).length / totalAchievements) * 100).toFixed(2)
                };

                // 3. Determine achievement types earned
                const hasParticipation = progress.completed > 0;
                const hasBeaten = achievements.some(a => a.DateEarned && a.Type === 3); // Type 3 = Progression
                const hasMastery = progress.percentage === 100;

                // 4. Calculate points
                const points = this.calculatePoints(gameConfig, {
                    participation: hasParticipation,
                    beaten: hasBeaten,
                    mastery: hasMastery
                });

                // 5. Update records
                await this.updateAchievementRecords(username, gameId, {
                    progress,
                    points,
                    types: {
                        participation: hasParticipation,
                        beaten: hasBeaten,
                        mastery: hasMastery
                    }
                }, session);

                return {
                    progress,
                    points,
                    gameConfig
                };
            });
        } catch (error) {
            console.error('[ACHIEVEMENT TRACKER] Error updating progress:', error);
            throw error;
        }
    }

    calculatePoints(gameConfig, achievements) {
        let total = 0;
        const breakdown = {};

        if (achievements.participation) {
            total += gameConfig.points.participation;
            breakdown.participation = gameConfig.points.participation;
        }

        if (achievements.beaten) {
            total += gameConfig.points.beaten;
            breakdown.beaten = gameConfig.points.beaten;
        }

        if (achievements.mastery && gameConfig.points.mastery) {
            total += gameConfig.points.mastery;
            breakdown.mastery = gameConfig.points.mastery;
        }

        return {
            total,
            breakdown
        };
    }

    async updateAchievementRecords(username, gameId, data, session) {
        const { progress, points, types } = data;
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        // Update achievement records
        const records = [];

        if (types.participation) {
            records.push({
                username,
                gameId,
                type: 'participation',
                points: points.breakdown.participation,
                progress: progress.percentage,
                month: currentMonth,
                year: currentYear,
                date: now
            });
        }

        if (types.beaten) {
            records.push({
                username,
                gameId,
                type: 'beaten',
                points: points.breakdown.beaten,
                progress: progress.percentage,
                month: currentMonth,
                year: currentYear,
                date: now
            });
        }

        if (types.mastery) {
            records.push({
                username,
                gameId,
                type: 'mastery',
                points: points.breakdown.mastery,
                progress: progress.percentage,
                month: currentMonth,
                year: currentYear,
                date: now
            });
        }

        // Insert all records
        if (records.length > 0) {
            await this.database.getCollection('achievement_records')
                .insertMany(records, { session });
        }

        // Update user stats
        await this.updateUserStats(username, gameId, data, session);
    }

    async updateUserStats(username, gameId, data, session) {
        const { progress, points, types } = data;
        const year = new Date().getFullYear().toString();

        // Get existing stats
        const userStats = await this.database.getUserStats(username) || {
            yearlyPoints: {},
            completedGames: {},
            gamesParticipated: 0,
            gamesBeaten: 0,
            gamesMastered: 0
        };

        // Update yearly points
        if (!userStats.yearlyPoints[year]) {
            userStats.yearlyPoints[year] = 0;
        }
        userStats.yearlyPoints[year] += points.total;

        // Update game counts
        if (types.participation) userStats.gamesParticipated++;
        if (types.beaten) userStats.gamesBeaten++;
        if (types.mastery) userStats.gamesMastered++;

        // Save updated stats
        await this.database.getCollection('userstats').updateOne(
            { username },
            { $set: userStats },
            { session, upsert: true }
        );
    }
}

module.exports = AchievementTracker;

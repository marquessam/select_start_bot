// achievementQueue.js
const { withTransaction } = require('./utils/transactions');

class AchievementQueue {
    constructor(database) {
        this.database = database;
        this.queue = new Map(); // username -> achievements map
        this.processing = false;
        this.retryDelays = [1000, 5000, 15000]; // Retry delays in ms
    }

    async add(username, achievement) {
        if (!this.queue.has(username)) {
            this.queue.set(username, []);
        }
        this.queue.get(username).push(achievement);

        if (!this.processing) {
            await this.process();
        }
    }

    async process() {
        if (this.processing) return;
        this.processing = true;

        try {
            // Process each user's achievements in order
            for (const [username, achievements] of this.queue.entries()) {
                await this.processUserAchievements(username, achievements);
                this.queue.delete(username);
            }
        } catch (error) {
            console.error('Achievement queue processing error:', error);
        } finally {
            this.processing = false;
        }
    }

    async processUserAchievements(username, achievements) {
        let attempt = 0;

        while (attempt < this.retryDelays.length) {
            try {
                await withTransaction(this.database, async (session) => {
                    // 1. Validate achievements haven't already been processed
                    const existingRecords = await this.database.getAchievementRecords(username, {
                        session,
                        achievements: achievements.map(a => a.ID)
                    });

                    const newAchievements = achievements.filter(
                        a => !existingRecords.some(r => r.achievementId === a.ID)
                    );

                    if (newAchievements.length === 0) {
                        return; // All achievements already processed
                    }

                    // 2. Calculate points for new achievements
                    const points = await this.calculatePoints(username, newAchievements, session);

                    // 3. Save achievement records
                    await this.saveAchievements(username, newAchievements, points, session);

                    // 4. Update user stats
                    await this.updateUserStats(username, newAchievements, points, session);

                    // Everything succeeded, exit retry loop
                    return;
                });

                break; // Success, exit retry loop
            } catch (error) {
                console.error(`Processing attempt ${attempt + 1} failed:`, error);
                
                if (attempt < this.retryDelays.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelays[attempt]));
                    attempt++;
                } else {
                    throw new Error(`Failed to process achievements after ${attempt + 1} attempts`);
                }
            }
        }
    }

    async calculatePoints(username, achievements, session) {
        const points = [];
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        // Group achievements by game
        const gameAchievements = new Map();
        for (const achievement of achievements) {
            if (!gameAchievements.has(achievement.GameID)) {
                gameAchievements.set(achievement.GameID, []);
            }
            gameAchievements.get(achievement.GameID).push(achievement);
        }

        // Calculate points for each game
        for (const [gameId, gameAchs] of gameAchievements) {
            // Sort achievements by date
            gameAchs.sort((a, b) => new Date(a.Date) - new Date(b.Date));

            // Get game progress after each achievement
            const gameProgress = await this.database.getGameProgress(
                username, 
                gameId,
                { session }
            );

            // Calculate points based on progress thresholds
            if (this.isGameParticipation(gameProgress, gameAchs)) {
                points.push({
                    type: 'participation',
                    gameId,
                    points: 1,
                    month: currentMonth,
                    year: currentYear
                });
            }

            if (this.isGameBeaten(gameProgress, gameAchs)) {
                points.push({
                    type: 'beaten',
                    gameId,
                    points: 3,
                    month: currentMonth,
                    year: currentYear
                });
            }

            if (this.isGameMastered(gameProgress)) {
                points.push({
                    type: 'mastery',
                    gameId,
                    points: 3,
                    month: currentMonth,
                    year: currentYear
                });
            }
        }

        return points;
    }

    isGameParticipation(progress, newAchievements) {
        return progress.userProgress > 0 || newAchievements.length > 0;
    }

    isGameBeaten(progress, newAchievements) {
        // Check for progression/story achievements
        return newAchievements.some(a => a.Type === 3) || progress.hasBeatenFlag;
    }

    isGameMastered(progress) {
        return progress.userProgress === 100;
    }

    async saveAchievements(username, achievements, points, session) {
        const records = achievements.map(achievement => ({
            username,
            achievementId: achievement.ID,
            gameId: achievement.GameID,
            date: new Date(achievement.Date),
            points: points.filter(p => p.gameId === achievement.GameID)
                        .reduce((sum, p) => sum + p.points, 0)
        }));

        await this.database.getCollection('achievement_records').insertMany(records, { session });
    }

    async updateUserStats(username, achievements, points, session) {
        const stats = await this.database.getUserStats(username, { session });
        const currentYear = new Date().getFullYear().toString();
        
        // Update achievement counts
        if (!stats.yearlyStats[currentYear]) {
            stats.yearlyStats[currentYear] = { totalAchievementsUnlocked: 0 };
        }
        stats.yearlyStats[currentYear].totalAchievementsUnlocked += achievements.length;

        // Update points
        for (const point of points) {
            if (!stats.yearlyPoints[currentYear]) {
                stats.yearlyPoints[currentYear] = 0;
            }
            stats.yearlyPoints[currentYear] += point.points;
        }

        // Save updated stats
        await this.database.getCollection('userstats').updateOne(
            { _id: username },
            { $set: stats },
            { session }
        );

        // Update leaderboard cache if available
        if (global.leaderboardCache) {
            await global.leaderboardCache.updateLeaderboards(true);
        }
    }
}

module.exports = AchievementQueue;

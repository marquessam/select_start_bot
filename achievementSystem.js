const AchievementQueue = require('./achievementQueue');
const AchievementTracker = require('./achievementTracker');

class AchievementSystem {
    constructor(database) {
        this.database = database;
        this.queue = new AchievementQueue(database);
        this.tracker = new AchievementTracker(database);
    }

    setServices(services) {
        this.services = services;
        console.log('[ACHIEVEMENT SYSTEM] Services linked:', Object.keys(services));
    }

    getGameConfig(gameId) {
        return AchievementSystem.Games[gameId];
    }

    async processAchievement(username, achievement) {
        await this.queue.add(username, achievement);
    }

    async checkUserAchievements(username, gameId, month, year) {
        try {
            console.log(`[ACHIEVEMENTS] Checking ${username} for game ${gameId} (${month}/${year})`);
            
            const gameConfig = this.getGameConfig(gameId);
            if (!gameConfig) {
                console.log(`[ACHIEVEMENTS] No config for game ${gameId}`);
                return;
            }

            // Check month/year restrictions
            if (gameConfig.restrictions) {
                const isValidMonth = month === gameConfig.restrictions.month;
                const isValidYear = year === gameConfig.restrictions.year;
                if (!isValidMonth || !isValidYear) {
                    console.log(`[ACHIEVEMENTS] Game ${gameId} not valid for ${month}/${year}`);
                    return;
                }
            }

            const gameProgress = await this.services.raAPI.fetchCompleteGameProgress(username, gameId);
            if (!gameProgress) {
                console.log(`[ACHIEVEMENTS] No progress found for ${username} in ${gameId}`);
                return;
            }

            console.log(`[ACHIEVEMENTS] ${username} progress in ${gameId}: ${gameProgress.highestAwardKind}`);

            // Use the tracker to update user progress and calculate points
            const achievements = gameProgress.achievements || [];
            const result = await this.tracker.updateUserProgress(username, gameId, achievements);

            if (result) {
                const { progress, points, gameConfig } = result;

                // Award points based on highest achievement
                switch (gameProgress.highestAwardKind) {
                    case AchievementSystem.GameAward.MASTERY:
                        if (gameConfig.restrictions?.masteryOnly) {
                            await this.addRecord(username, gameId, 'mastered', month, year, points.breakdown.mastery);
                        } else {
                            await this.addRecord(username, gameId, 'mastered', month, year, points.breakdown.mastery);
                            await this.addRecord(username, gameId, 'beaten', month, year, points.breakdown.beaten);
                            await this.addRecord(username, gameId, 'participation', month, year, points.breakdown.participation);
                        }
                        break;

                    case AchievementSystem.GameAward.BEATEN:
                        if (!gameConfig.restrictions?.masteryOnly) {
                            await this.addRecord(username, gameId, 'beaten', month, year, points.breakdown.beaten);
                            await this.addRecord(username, gameId, 'participation', month, year, points.breakdown.participation);
                        }
                        break;

                    case AchievementSystem.GameAward.PARTICIPATION:
                        if (!gameConfig.restrictions?.masteryOnly) {
                            await this.addRecord(username, gameId, 'participation', month, year, points.breakdown.participation);
                        }
                        break;
                }
            }
        } catch (error) {
            console.error('[ACHIEVEMENTS] Error checking achievements:', error);
        }
    }

    async addRecord(username, gameId, type, month, year, points) {
        try {
            const cleanUsername = username.toLowerCase().trim();
            const record = {
                username: cleanUsername,
                gameId,
                type,
                points,
                month,
                year: year.toString(),
                date: new Date().toISOString(),
                gameName: this.getGameConfig(gameId)?.name || 'Unknown Game'
            };

            // Check for existing record
            const exists = await this.database.getCollection('achievement_records').findOne({
                username: cleanUsername,
                gameId,
                type,
                month,
                year: record.year
            });

            if (exists) {
                console.log(`[ACHIEVEMENTS] Record already exists for ${username} - ${gameId} - ${type}`);
                return false;
            }

            await this.database.getCollection('achievement_records').insertOne(record);
            console.log(`[ACHIEVEMENTS] Added record for ${username} - ${gameId} - ${type}`);

            // Announce points if needed
            if (this.services?.achievementFeed && !this.services.achievementFeed.isPaused) {
                await this.services.achievementFeed.announcePointsAward(
                    username,
                    points,
                    `${record.gameName} - ${type}`
                );
            }

            return true;
        } catch (error) {
            console.error('[ACHIEVEMENTS] Error adding record:', error);
            return false;
        }
    }

    async calculatePoints(username, month = null, year = null) {
        try {
            const query = { username: username.toLowerCase() };
            if (month) query.month = parseInt(month);
            if (year) query.year = year.toString();

            const collection = await this.database.getCollection('achievement_records');
            const records = await collection.find(query).toArray();
            console.log(`[ACHIEVEMENTS] Found ${records.length} records for ${username}`);

            // Group by game
            const gamePoints = {};
            let total = 0;

            for (const record of records) {
                if (!gamePoints[record.gameId]) {
                    gamePoints[record.gameId] = {
                        name: record.gameName,
                        points: 0,
                        achievements: []
                    };
                }

                gamePoints[record.gameId].points += record.points;
                gamePoints[record.gameId].achievements.push({
                    type: record.type,
                    points: record.points,
                    date: record.date
                });
                total += record.points;
            }

            return {
                total,
                games: gamePoints
            };
        } catch (error) {
            console.error('[ACHIEVEMENTS] Error calculating points:', error);
            return { total: 0, games: {} };
        }
    }

    async getMonthlyGames(month, year) {
        const games = Object.entries(AchievementSystem.Games)
            .filter(([_, config]) => {
                if (!config.restrictions) return false;
                return config.restrictions.month === month && 
                       config.restrictions.year === year;
            })
            .map(([gameId, config]) => ({
                gameId,
                name: config.name,
                isMonthly: config.monthly || false,
                isShadow: config.shadowGame || false
            }));

        return {
            monthly: games.filter(g => g.isMonthly),
            shadow: games.filter(g => g.isShadow)
        };
    }
}

// Static properties
AchievementSystem.GameAward = {
    MASTERY: 'mastered',
    BEATEN: 'beaten',
    PARTICIPATION: 'participation'
};

AchievementSystem.Games = {
    "319": {  // Chrono Trigger
        name: "Chrono Trigger",
        points: {
            participation: 1,
            beaten: 3,
            mastery: 3
        },
        monthly: true,
        restrictions: {
            month: 1,
            year: 2025,
            masteryOnly: true
        }
    },
    "355": {  // ALTTP
        name: "The Legend of Zelda: A Link to the Past",
        points: {
            participation: 1,
            beaten: 3,
            mastery: 3
        },
        monthly: true,
        restrictions: {
            month: 2,
            year: 2025
        }
    },
    "10024": {  // Mario Tennis
        name: "Mario Tennis",
        points: {
            participation: 1,
            beaten: 3
        },
        monthly: true,
        restrictions: {
            month: 1,
            year: 2025
        }
    },
    "274": {  // U.N. Squadron
        name: "U.N. Squadron",
        points: {
            participation: 1,
            beaten: 3
        },
        shadowGame: true,
        restrictions: {
            month: 2,
            year: 2025
        }
    }
};

module.exports = AchievementSystem;

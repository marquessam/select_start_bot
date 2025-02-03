// achievementSystem.js
class AchievementSystem {
    constructor(database) {
        this.database = database;
        this.services = null;
    }

    static Types = {
        PARTICIPATION: 'participation',
        BEATEN: 'beaten',
        MASTERY: 'mastery'
    };

    static Games = {
        "319": {  // Chrono Trigger
            name: "Chrono Trigger",
            points: {
                participation: 1,
                beaten: 3,
                mastery: 3
            },
            progression: [2080, 2081, 2085, 2090, 2191, 2100, 2108, 2129, 2133],
            winCondition: [2266, 2281],
            requireProgression: true,
            requireAllWinConditions: false,
            masteryCheck: true,
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
            progression: [944, 2192, 2282, 980, 2288, 2291, 2292, 2296, 2315],
            winCondition: [2389],
            requireProgression: true,
            requireAllWinConditions: true,
            masteryCheck: true,
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
            winCondition: [48411, 48412],
            requireProgression: false,
            requireAllWinConditions: false,
            masteryCheck: false,
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
            progression: [6413, 6414, 6415, 6416, 6417, 6418, 6419, 6420, 6421],
            winCondition: [6422],
            requireProgression: true,
            requireAllWinConditions: true,
            masteryCheck: false,
            shadowGame: true,
            restrictions: {
                month: 2,
                year: 2025
            }
        }
    };

    setServices(services) {
        this.services = services;
        console.log('[ACHIEVEMENT SYSTEM] Services linked:', Object.keys(services));
    }

    getGameConfig(gameId) {
        return AchievementSystem.Games[gameId];
    }

    async checkAchievements(username, achievements, gameId, month, year) {
        try {
            const gameConfig = this.getGameConfig(gameId);
            if (!gameConfig) {
                console.log(`[ACHIEVEMENTS] No game config found for ${gameId}`);
                return;
            }

            const gameAchievements = achievements.filter(a => 
                String(a.GameID) === String(gameId)
            );

            // Check participation (earned in month)
            const hasParticipationInMonth = !gameConfig.restrictions?.masteryOnly && 
                gameAchievements.some(a => {
                    const earnedDate = new Date(a.DateEarned);
                    return parseInt(a.DateEarned) > 0 && 
                           earnedDate.getMonth() + 1 === month && 
                           earnedDate.getFullYear() === year;
                });

            if (hasParticipationInMonth) {
                await this.addRecord(
                    username,
                    gameId,
                    AchievementSystem.Types.PARTICIPATION,
                    month,
                    year,
                    gameConfig.points.participation
                );
            }

            // Check beaten (all required achievements earned in month)
            let isBeaten = true;

            // Check progression requirements if needed
            if (gameConfig.requireProgression) {
                isBeaten = gameConfig.progression.every(achId => {
                    const ach = gameAchievements.find(a => parseInt(a.ID) === achId);
                    if (!ach || !parseInt(ach.DateEarned)) return false;
                    
                    const earnedDate = new Date(ach.DateEarned);
                    return earnedDate.getMonth() + 1 === month && 
                           earnedDate.getFullYear() === year;
                });
            }

            // Check win conditions
            if (isBeaten && gameConfig.winCondition) {
                if (gameConfig.requireAllWinConditions) {
                    isBeaten = gameConfig.winCondition.every(achId => {
                        const ach = gameAchievements.find(a => parseInt(a.ID) === achId);
                        if (!ach || !parseInt(ach.DateEarned)) return false;
                        
                        const earnedDate = new Date(ach.DateEarned);
                        return earnedDate.getMonth() + 1 === month && 
                               earnedDate.getFullYear() === year;
                    });
                } else {
                    isBeaten = gameConfig.winCondition.some(achId => {
                        const ach = gameAchievements.find(a => parseInt(a.ID) === achId);
                        if (!ach || !parseInt(ach.DateEarned)) return false;
                        
                        const earnedDate = new Date(ach.DateEarned);
                        return earnedDate.getMonth() + 1 === month && 
                               earnedDate.getFullYear() === year;
                    });
                }
            }

            if (isBeaten) {
                await this.addRecord(
                    username,
                    gameId,
                    AchievementSystem.Types.BEATEN,
                    month,
                    year,
                    gameConfig.points.beaten
                );
            }

            // Check mastery (can be earned any time)
            if (gameConfig.masteryCheck) {
                const totalAchievements = gameAchievements.length;
                const completedAchievements = gameAchievements.filter(a => 
                    parseInt(a.DateEarned) > 0
                ).length;

                if (totalAchievements > 0 && totalAchievements === completedAchievements) {
                    await this.addRecord(
                        username,
                        gameId,
                        AchievementSystem.Types.MASTERY,
                        month,
                        year,
                        gameConfig.points.mastery
                    );
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
                gameName: AchievementSystem.Games[gameId]?.name || 'Unknown Game'
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
            const points = {
                total: 0,
                achievements: records
            };

            // Calculate total and organize by game
            const gamePoints = {};
            for (const record of records) {
                if (!gamePoints[record.gameId]) {
                    gamePoints[record.gameId] = {
                        name: record.gameName,
                        points: 0,
                        achievements: []
                    };
                }
                points.total += record.points;
                gamePoints[record.gameId].points += record.points;
                gamePoints[record.gameId].achievements.push(record);
            }

            return {
                total: points.total,
                games: gamePoints
            };
        } catch (error) {
            console.error('[ACHIEVEMENTS] Error calculating points:', error);
            return { total: 0, games: {} };
        }
    }
}

module.exports = AchievementSystem;

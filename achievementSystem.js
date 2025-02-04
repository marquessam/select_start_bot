// achievementSystem.js
class AchievementSystem {
    constructor(database) {
        this.database = database;
        this.services = null;
    }

    static GameAward = {
        MASTERY: 'mastered',
        BEATEN: 'beaten',
        PARTICIPATION: 'participation'
    };

    static Games = {
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

    setServices(services) {
        this.services = services;
        console.log('[ACHIEVEMENT SYSTEM] Services linked:', Object.keys(services));
    }

    getGameConfig(gameId) {
        return AchievementSystem.Games[gameId];
    }

    async checkUserAchievements(username, gameId, month, year) {
        try {
            console.log(`[ACHIEVEMENTS] Checking achievements for ${username} in game ${gameId}`);
            
            const gameConfig = this.getGameConfig(gameId);
            if (!gameConfig) {
                console.log(`[ACHIEVEMENTS] No game config found for ${gameId}`);
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

            // Get complete game progress
            const gameProgress = await this.services.raAPI.fetchCompleteGameProgress(username, gameId);
            if (!gameProgress) {
                console.log(`[ACHIEVEMENTS] No game progress found for ${username} in ${gameId}`);
                return;
            }

            // Log progress
            console.log(`[ACHIEVEMENTS] Progress for ${username} in ${gameId}:`, {
                completion: gameProgress.userCompletion,
                awarded: gameProgress.numAwardedToUser,
                total: gameProgress.numAchievements
            });

            // Check for completion statuses
            const isMastered = gameProgress.numAchievements > 0 && 
                             gameProgress.numAwardedToUser === gameProgress.numAchievements;
            
            const isBeaten = Object.values(gameProgress.achievements)
                .some(ach => ach.type === 'progression' && ach.dateEarned);

            const hasParticipated = gameProgress.numAwardedToUser > 0;

            // Award points based on highest status achieved
            if (isMastered) {
                console.log(`[ACHIEVEMENTS] ${username} has mastered ${gameId}`);
                if (!gameConfig.restrictions?.masteryOnly) {
                    await this.addRecord(username, gameId, 'participation', month, year, gameConfig.points.participation);
                    await this.addRecord(username, gameId, 'beaten', month, year, gameConfig.points.beaten);
                }
                await this.addRecord(username, gameId, 'mastered', month, year, gameConfig.points.mastery);
            }
            else if (isBeaten && !gameConfig.restrictions?.masteryOnly) {
                console.log(`[ACHIEVEMENTS] ${username} has beaten ${gameId}`);
                await this.addRecord(username, gameId, 'participation', month, year, gameConfig.points.participation);
                await this.addRecord(username, gameId, 'beaten', month, year, gameConfig.points.beaten);
            }
            else if (hasParticipated && !gameConfig.restrictions?.masteryOnly) {
                console.log(`[ACHIEVEMENTS] ${username} has participated in ${gameId}`);
                await this.addRecord(username, gameId, 'participation', month, year, gameConfig.points.participation);
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

module.exports = AchievementSystem;

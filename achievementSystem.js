// Create new file: achievementSystem.js

const pointsConfig = require('./pointsConfig');

class AchievementSystem {
    constructor(database) {
        this.database = database;
        this.services = null;
    }

    setServices(services) {
        this.services = services;
        console.log('[ACHIEVEMENT SYSTEM] Services updated');
    }

    // Achievement type enumeration
    static Types = {
        PARTICIPATION: 'participation',
        BEATEN: 'beaten',
        MASTERY: 'mastery'
    };

    // Game ID enumeration
    static Games = {
        CHRONO_TRIGGER: '319',
        ZELDA_ALTTP: '355',
        MARIO_TENNIS: '10024',
        UN_SQUADRON: '274'
    };

    static GameNames = {
        [AchievementSystem.Games.CHRONO_TRIGGER]: 'Chrono Trigger',
        [AchievementSystem.Games.ZELDA_ALTTP]: 'The Legend of Zelda: A Link to the Past',
        [AchievementSystem.Games.MARIO_TENNIS]: 'Mario Tennis',
        [AchievementSystem.Games.UN_SQUADRON]: 'U.N. Squadron'
    };

    static PointValues = {
        [AchievementSystem.Types.PARTICIPATION]: 1,
        [AchievementSystem.Types.BEATEN]: 3,
        [AchievementSystem.Types.MASTERY]: 3
    };

    async addRecord(username, gameId, type) {
        try {
            const cleanUsername = username.toLowerCase().trim();
            const record = {
                username: cleanUsername,
                gameId,
                type,
                date: new Date().toISOString(),
                year: new Date().getFullYear().toString()
            };

            // Check for existing record
            const exists = await this.database.getCollection('achievement_records').findOne({
                username: cleanUsername,
                gameId,
                type,
                year: record.year
            });

            if (exists) {
                console.log(`[ACHIEVEMENTS] Record already exists for ${username} - ${gameId} - ${type}`);
                return false;
            }

            // Add new record
            await this.database.getCollection('achievement_records').insertOne(record);
            console.log(`[ACHIEVEMENTS] Added record for ${username} - ${gameId} - ${type}`);

            // Announce achievement if feed is active
            if (this.services?.achievementFeed && !this.services.achievementFeed.isPaused) {
                const gameName = AchievementSystem.GameNames[gameId];
                const points = AchievementSystem.PointValues[type];
                await this.services.achievementFeed.announcePointsAward(
                    username,
                    points,
                    `${gameName} - ${type}`
                );
            }

            return true;
        } catch (error) {
            console.error('[ACHIEVEMENTS] Error adding record:', error);
            return false;
        }
    }

    async calculatePoints(username, year = null) {
        try {
            const targetYear = year || new Date().getFullYear().toString();
            const records = await this.database.getCollection('achievement_records')
                .find({
                    username: username.toLowerCase(),
                    year: targetYear
                })
                .toArray();

            let total = 0;
            const details = {
                participations: [],
                gamesBeaten: [],
                gamesMastered: []
            };

            for (const record of records) {
                const points = AchievementSystem.PointValues[record.type];
                const gameName = AchievementSystem.GameNames[record.gameId];
                
                total += points;

                const detail = {
                    gameName,
                    points,
                    date: record.date
                };

                switch (record.type) {
                    case AchievementSystem.Types.PARTICIPATION:
                        details.participations.push(detail);
                        break;
                    case AchievementSystem.Types.BEATEN:
                        details.gamesBeaten.push(detail);
                        break;
                    case AchievementSystem.Types.MASTERY:
                        details.gamesMastered.push(detail);
                        break;
                }
            }

            // Sort details by date
            const sortByDate = (a, b) => new Date(b.date) - new Date(a.date);
            details.participations.sort(sortByDate);
            details.gamesBeaten.sort(sortByDate);
            details.gamesMastered.sort(sortByDate);

            return {
                total,
                details
            };
        } catch (error) {
            console.error('[ACHIEVEMENTS] Error calculating points:', error);
            return { total: 0, details: {} };
        }
    }

    async checkAchievements(username, achievements, gameId) {
        try {
            const gameConfig = pointsConfig.monthlyGames[gameId];
            if (!gameConfig) return;

            const gameAchievements = achievements.filter(a => 
                String(a.GameID) === String(gameId)
            );

            // Check participation
            const hasParticipation = gameAchievements.some(a => 
                parseInt(a.DateEarned) > 0
            );
            if (hasParticipation) {
                await this.addRecord(
                    username,
                    gameId,
                    AchievementSystem.Types.PARTICIPATION
                );
            }

            // Check game completion
            const isCompleted = this._checkGameCompletion(gameAchievements, gameConfig);
            if (isCompleted) {
                await this.addRecord(
                    username,
                    gameId,
                    AchievementSystem.Types.BEATEN
                );
            }

            // Check mastery
            if (gameConfig.masteryCheck) {
                const totalAchievements = gameAchievements.length;
                const completedAchievements = gameAchievements.filter(a => 
                    parseInt(a.DateEarned) > 0
                ).length;

                if (totalAchievements > 0 && totalAchievements === completedAchievements) {
                    await this.addRecord(
                        username,
                        gameId,
                        AchievementSystem.Types.MASTERY
                    );
                }
            }
        } catch (error) {
            console.error('[ACHIEVEMENTS] Error checking achievements:', error);
        }
    }

    _checkGameCompletion(achievements, gameConfig) {
        // Check progression requirements if needed
        if (gameConfig.requireProgression) {
            const hasProgression = gameConfig.progression.every(achId =>
                achievements.some(a => 
                    parseInt(a.ID) === achId && 
                    parseInt(a.DateEarned) > 0
                )
            );
            if (!hasProgression) return false;
        }

        // Check win conditions
        if (gameConfig.winCondition?.length > 0) {
            if (gameConfig.requireAllWinConditions) {
                return gameConfig.winCondition.every(achId =>
                    achievements.some(a => 
                        parseInt(a.ID) === achId && 
                        parseInt(a.DateEarned) > 0
                    )
                );
            }
            return gameConfig.winCondition.some(achId =>
                achievements.some(a => 
                    parseInt(a.ID) === achId && 
                    parseInt(a.DateEarned) > 0
                )
            );
        }

        return true;
    }

    async generateLeaderboard(users, year = null) {
        try {
            const targetYear = year || new Date().getFullYear().toString();
            const leaderboard = [];

            for (const username of users) {
                const points = await this.calculatePoints(username, targetYear);
                leaderboard.push({
                    username,
                    points: points.total,
                    details: points.details
                });
            }

            return leaderboard.sort((a, b) => b.points - a.points);
        } catch (error) {
            console.error('[ACHIEVEMENTS] Error generating leaderboard:', error);
            return [];
        }
    }

    async getUserAchievements(username, year = null) {
        try {
            const targetYear = year || new Date().getFullYear().toString();
            return await this.database.getCollection('achievement_records')
                .find({
                    username: username.toLowerCase(),
                    year: targetYear
                })
                .toArray();
        } catch (error) {
            console.error('[ACHIEVEMENTS] Error getting user achievements:', error);
            return [];
        }
    }
}

module.exports = AchievementSystem;

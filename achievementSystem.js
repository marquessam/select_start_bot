// achievementSystem.js
const pointsConfig = require('./pointsConfig');

class AchievementSystem {
    constructor(database) {
        this.database = database;
        this.services = null;
        
        // Define the monthly games schedule
        this.monthlyGames = {
            "1": { // January 2025
                main: "319",    // Chrono Trigger
                shadow: "10024" // Mario Tennis
            },
            "2": { // February 2025
                main: "355",    // Zelda: ALTTP
                shadow: "274"   // UN Squadron
            }
        };
    }

    static Types = {
        PARTICIPATION: 'participation',
        BEATEN: 'beaten',
        MASTERY: 'mastery'
    };

    async checkAchievements(username, achievements, gameId, month, year) {
        try {
            const gameConfig = pointsConfig.monthlyGames[gameId];
            if (!gameConfig) {
                console.log(`[ACHIEVEMENTS] No game config found for ${gameId}`);
                return;
            }

            const gameAchievements = achievements.filter(a => 
                String(a.GameID) === String(gameId)
            );

            // Check participation (earned in month)
            const hasParticipationInMonth = gameAchievements.some(a => {
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

            // Check win conditions if still valid
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
                gameName: pointsConfig.monthlyGames[gameId].name
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

            const records = await this.database.getCollection('achievement_records')
                .find(query)
                .toArray();

            const points = {
                total: 0,
                games: {}
            };

            for (const record of records) {
                if (!points.games[record.gameId]) {
                    points.games[record.gameId] = {
                        name: pointsConfig.monthlyGames[record.gameId].name,
                        points: 0,
                        achievements: []
                    };
                }

                points.total += record.points;
                points.games[record.gameId].points += record.points;
                points.games[record.gameId].achievements.push({
                    type: record.type,
                    points: record.points,
                    date: record.date
                });
            }

            return points;
        } catch (error) {
            console.error('[ACHIEVEMENTS] Error calculating points:', error);
            return { total: 0, games: {} };
        }
    }

    getMonthlyGames(month, year) {
        const monthKey = month.toString();
        if (!this.monthlyGames[monthKey]) return [];
        
        return [
            this.monthlyGames[monthKey].main,
            this.monthlyGames[monthKey].shadow
        ];
    }
}

module.exports = AchievementSystem;

// pointsConfig.js

const monthlySchedule = {
    "2025": {
        "1": { // January
            main: "319",    // Chrono Trigger
            shadow: "10024" // Mario Tennis
        },
        "2": { // February
            main: "355",    // Zelda: ALTTP
            shadow: "274"   // UN Squadron
        }
    }
};

const pointsConfig = {
    monthlyGames: {
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
            // Special handling for Chrono Trigger
            restrictions: {
                month: 1,
                year: 2025,
                masteryOnly: true  // Only mastery points are available
            }
        },
        "355": {  // ALTTP
            name: "The Legend of Zelda: A Link to the Past",
            points: {
                participation: 1,
                beaten: 3,
                mastery: 3
            },
            progression: [944, 2192, 2282, 980, 2288, 2291, 2292, 2296, 2315, 2336, 2351, 
                         2357, 2359, 2361, 2365, 2334, 2354, 2368, 2350, 2372, 2387],
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
        "274": {  // U.N. Squadron (Shadow Game)
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
    },

    // Validation functions
    isValidForMonth(gameId, month, year) {
        const game = this.monthlyGames[gameId];
        if (!game) return false;

        // Check if the game is scheduled for this month/year
        return game.restrictions.month === month && 
               game.restrictions.year === year;
    },

    canEarnPoints(gameId, type, month, year) {
        const game = this.monthlyGames[gameId];
        if (!game || !game.points[type]) return false;

        // Handle shadow game state
        if (game.shadowGame && !monthlySchedule[year]?.[month]?.shadow === gameId) {
            return false;
        }

        // Handle Chrono Trigger special case
        if (gameId === "319" && type !== 'mastery') {
            return false;
        }

        // For mastery, don't check month restrictions
        if (type === 'mastery' && game.masteryCheck) {
            return true;
        }

        // For participation and beaten, must be in correct month
        return this.isValidForMonth(gameId, month, year);
    },

    validateAchievements(achievements, gameId, type) {
        const game = this.monthlyGames[gameId];
        if (!game) return false;

        const gameAchievements = achievements.filter(a => 
            String(a.GameID) === String(gameId)
        );

        switch (type) {
            case 'participation':
                return gameAchievements.some(a => parseInt(a.DateEarned) > 0);

            case 'beaten':
                // Check progression if required
                if (game.requireProgression) {
                    const hasProgression = game.progression.every(achId =>
                        gameAchievements.some(a => 
                            parseInt(a.ID) === achId && 
                            parseInt(a.DateEarned) > 0
                        )
                    );
                    if (!hasProgression) return false;
                }

                // Check win conditions
                if (game.winCondition?.length > 0) {
                    if (game.requireAllWinConditions) {
                        return game.winCondition.every(achId =>
                            gameAchievements.some(a => 
                                parseInt(a.ID) === achId && 
                                parseInt(a.DateEarned) > 0
                            )
                        );
                    }
                    return game.winCondition.some(achId =>
                        gameAchievements.some(a => 
                            parseInt(a.ID) === achId && 
                            parseInt(a.DateEarned) > 0
                        )
                    );
                }
                return true;

            case 'mastery':
                if (!game.masteryCheck) return false;
                const totalAchievements = gameAchievements.length;
                const completedAchievements = gameAchievements.filter(a => 
                    parseInt(a.DateEarned) > 0
                ).length;
                return totalAchievements > 0 && totalAchievements === completedAchievements;

            default:
                return false;
        }
    },

    getGameConfig(gameId) {
        return this.monthlyGames[gameId];
    }
};

module.exports = {
    pointsConfig,
    monthlySchedule
};

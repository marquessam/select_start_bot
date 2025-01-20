// pointsConfig.js

const database = require('./database');  // Ensure this path is correct

// Points configuration for all games
const pointsConfig = {
    monthlyGames: {
        "319": {
            name: "Chrono Trigger",
            points: {
                participation: 1,
                beaten: 3,
                mastery: 3
            },
            progression: [2080, 2081, 2085, 2090, 2191, 2100, 2108, 2129, 2133],
            winCondition: [2266, 2281],
            requireProgression: true,
            requireAllWinConditions: true,
            masteryCheck: true
        },
        "10024": {
            name: "Mario Tennis",
            points: {
                participation: 1,
                beaten: 3
            },
            winCondition: [48411, 48412],
            requireProgression: false,
            requireAllWinConditions: false,
            masteryCheck: false
        }
    }
};

// Helper functions

/**
 * Checks if the user has already received points for a specific game and point type.
 * @param {Array} bonusPoints - The user's bonus points array.
 * @param {string} gameId - The ID of the game.
 * @param {string} pointType - The type of points ('participation', 'beaten', 'mastery').
 * @returns {boolean} - True if points have already been awarded, false otherwise.
 */
function hasReceivedPoints(bonusPoints, gameId, pointType) {
    if (!bonusPoints || !Array.isArray(bonusPoints)) {
        return false;
    }
    
    const exactKey = `${pointType}-${gameId}`;
    return bonusPoints.some(bp => bp.technicalKey === exactKey);
}

/**
 * Creates point reason objects with display and internal reasons.
 * @param {string} gameName - The name of the game.
 * @param {string} achievementType - The type of achievement ('Participation', 'Game Beaten', 'Mastery').
 * @param {string} technicalKey - The technical key for the reason (e.g., 'participation-319').
 * @returns {Object} - An object containing display and internal reasons.
 */
function createPointReason(gameName, achievementType, technicalKey) {
    return {
        display: `${gameName} - ${achievementType}`,
        internal: `${gameName} - ${achievementType} (${technicalKey})`
    };
}

// Point awarding checks
const pointChecks = {
    /**
     * Checks and returns points to be awarded for a specific game.
     * @param {string} username - The username of the user.
     * @param {Array} achievements - The list of achievements the user has.
     * @param {string} gameId - The ID of the game to check.
     * @param {Object} userStats - The user's statistics object.
     * @returns {Array} - An array of point objects to be awarded.
     */
    async checkGamePoints(username, achievements, gameId, userStats) {
        console.log(`[POINTS] Checking ${username}'s points for game ${gameId}`);
        
        const gameConfig = pointsConfig.monthlyGames[gameId];
        if (!gameConfig) {
            console.log(`[POINTS] No config found for game ${gameId}`);
            return [];
        }

        const points = [];
        const gameAchievements = achievements.filter(a => {
            const achievementGameId = String(a.GameID || a.gameId);
            return achievementGameId === String(gameId);
        });

        console.log(`[POINTS] Found ${gameAchievements.length} achievements for game ${gameId}`);

        // Fetch existing bonus points from the database
        const existingBonusPoints = await database.getUserBonusPoints(username);

        // Check participation
        const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
        if (hasParticipation && !hasReceivedPoints(existingBonusPoints, gameId, 'participation')) {
            const participationKey = `participation-${gameId}`;
            const reason = createPointReason(gameConfig.name, "Participation", participationKey);
            points.push({
                points: gameConfig.points.participation,
                reason: reason.display,
                internalReason: reason.internal,
                technicalKey: participationKey,
                pointType: 'participation',
                gameId
            });
            console.log(`[POINTS] Adding participation point for ${username}`);

            const bonusPoint = {
                points: gameConfig.points.participation,
                reason: reason.display,
                internalReason: reason.internal,
                technicalKey: participationKey,
                pointType: 'participation',
                gameId,
                year: new Date().getFullYear().toString(),
                date: new Date().toISOString()
            };
            // Award points by adding to the database
            await database.addUserBonusPoints(username, bonusPoint);
        }

        // Check beaten status
        if (!hasReceivedPoints(existingBonusPoints, gameId, 'beaten')) {
            let hasBeaten = true;

            if (gameConfig.requireProgression && gameConfig.progression) {
                hasBeaten = gameConfig.progression.every(achId =>
                    gameAchievements.some(a => 
                        parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                    )
                );
            }

            if (hasBeaten) {
                if (gameConfig.requireAllWinConditions) {
                    hasBeaten = gameConfig.winCondition.every(achId =>
                        gameAchievements.some(a => 
                            parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                        )
                    );
                } else {
                    hasBeaten = gameConfig.winCondition.some(achId =>
                        gameAchievements.some(a => 
                            parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                        )
                    );
                }
            }

            if (hasBeaten) {
                const beatenKey = `beaten-${gameId}`;
                const reason = createPointReason(gameConfig.name, "Game Beaten", beatenKey);
                points.push({
                    points: gameConfig.points.beaten,
                    reason: reason.display,
                    internalReason: reason.internal,
                    technicalKey: beatenKey,
                    pointType: 'beaten',
                    gameId
                });
                console.log(`[POINTS] Adding beaten points for ${username}`);

                const bonusPoint = {
                    points: gameConfig.points.beaten,
                    reason: reason.display,
                    internalReason: reason.internal,
                    technicalKey: beatenKey,
                    pointType: 'beaten',
                    gameId,
                    year: new Date().getFullYear().toString(),
                    date: new Date().toISOString()
                };
                // Award points by adding to the database
                await database.addUserBonusPoints(username, bonusPoint);
            }
        }

        // Check mastery if applicable
        if (gameConfig.masteryCheck && !hasReceivedPoints(existingBonusPoints, gameId, 'mastery')) {
            const totalAchievements = gameAchievements.length;
            const earnedAchievements = gameAchievements.filter(a => 
                parseInt(a.DateEarned) > 0
            ).length;
            
            if (totalAchievements > 0 && totalAchievements === earnedAchievements) {
                const masteryKey = `mastery-${gameId}`;
                const reason = createPointReason(gameConfig.name, "Mastery", masteryKey);
                points.push({
                    points: gameConfig.points.mastery,
                    reason: reason.display,
                    internalReason: reason.internal,
                    technicalKey: masteryKey,
                    pointType: 'mastery',
                    gameId
                });
                console.log(`[POINTS] Adding mastery points for ${username}`);

                const bonusPoint = {
                    points: gameConfig.points.mastery,
                    reason: reason.display,
                    internalReason: reason.internal,
                    technicalKey: masteryKey,
                    pointType: 'mastery',
                    gameId,
                    year: new Date().getFullYear().toString(),
                    date: new Date().toISOString()
                };
                // Award points by adding to the database
                await database.addUserBonusPoints(username, bonusPoint);
            }
        }

        if (points.length > 0) {
            console.log(`[POINTS] Total points to award to ${username} for game ${gameId}:`, 
                points.map(p => `${p.reason}: ${p.points}`).join(', ')
            );
        }

        return points;
    }
};

module.exports = {
    pointsConfig,
    pointChecks
};

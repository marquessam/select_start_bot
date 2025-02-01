// pointsConfig.js
const database = require('./database');

const pointsConfig = {
    monthlyGames: {
        "319": {  // Chrono Trigger
            name: "Chrono Trigger",
            points: {
                mastery: 3  // Only mastery available now
            },
            masteryCheck: true
        },
        "355": {  // ALTTP
            name: "The Legend of Zelda: A Link to the Past",
            points: {
                mastery: 3,
                participation: 1,
                beaten: 3
            },
            progression: [944, 2192, 2282, 980, 2288, 2291, 2292, 2296, 2315, 2336, 2351, 
                         2357, 2359, 2361, 2365, 2334, 2354, 2368, 2350, 2372, 2387],
            winCondition: [2389],
            requireProgression: true,
            requireAllWinConditions: true,
            masteryCheck: true
        },
        "274": {  // UN Squadron (Shadow Game)
            name: "U.N. Squadron",
            shadowGame: true,
            points: {
                participation: 1,
                beaten: 3
            },
            progression: [6413, 6414, 6415, 6416, 6417, 6418, 6419, 6420, 6421],
            winCondition: [6422],
            requireProgression: true,
            requireAllWinConditions: true,
            masteryCheck: false,
            active: false  // Will become true when discovered through triforce hunt
        }
    }
};

async function canAwardPoints(username, gameId, pointType) {
    const gameConfig = pointsConfig.monthlyGames[gameId];
    if (!gameConfig) return false;
    
    // Shadow games must be active to award any points
    if (gameConfig.shadowGame && !gameConfig.active) {
        console.log(`[POINTS CONFIG] Cannot award points - shadow game ${gameConfig.name} is not active`);
        return false;
    }

    // For Chrono Trigger, only allow mastery
    if (gameId === "319" && pointType !== 'mastery') {
        return false;
    }

    // Check if point type exists in points config
    return !!gameConfig.points[pointType];
}

const pointChecks = {
    async checkGamePoints(username, achievements, gameId, userStats) {
        console.log(`[POINTS] Checking ${username}'s points for game ${gameId}`);
        
        const gameConfig = pointsConfig.monthlyGames[gameId];
        if (!gameConfig) {
            console.log(`[POINTS] No config found for game ${gameId}`);
            return [];
        }

        const gameAchievements = achievements.filter(a => {
            const achievementGameId = String(a.GameID || a.gameId);
            return achievementGameId === String(gameId);
        });
        console.log(`[POINTS] Found ${gameAchievements.length} achievements for game ${gameId}`);

        const pointsToAward = [];

        // Check participation (except for Chrono Trigger)
        if (gameId !== "319") {
            const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
            if (hasParticipation && await canAwardPoints(username, gameId, 'participation')) {
                const participationKey = `participation-${gameId}`;
                const reason = createPointReason(gameConfig.name, "Participation", participationKey);
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

                const added = await database.addUserBonusPoints(username, bonusPoint);
                if (added) {
                    pointsToAward.push(bonusPoint);
                    console.log(`[POINTS] Awarded participation points to ${username} for game ${gameId}`);
                } else {
                    console.log(`[POINTS] Duplicate participation points prevented for ${username} on game ${gameId}`);
                }
            }
        }

        // Check beaten status (except for Chrono Trigger)
        if (gameId !== "319") {
            let hasBeaten = true;
            if (gameConfig.requireProgression && gameConfig.progression) {
                hasBeaten = gameConfig.progression.every(achId =>
                    gameAchievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0)
                );
            }

            if (hasBeaten) {
                if (gameConfig.requireAllWinConditions) {
                    hasBeaten = gameConfig.winCondition.every(achId =>
                        gameAchievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0)
                    );
                } else {
                    hasBeaten = gameConfig.winCondition.some(achId =>
                        gameAchievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0)
                    );
                }
            }

            if (hasBeaten && await canAwardPoints(username, gameId, 'beaten')) {
                const beatenKey = `beaten-${gameId}`;
                const reason = createPointReason(gameConfig.name, "Game Beaten", beatenKey);
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

                const added = await database.addUserBonusPoints(username, bonusPoint);
                if (added) {
                    pointsToAward.push(bonusPoint);
                    console.log(`[POINTS] Awarded beaten points to ${username} for game ${gameId}`);
                } else {
                    console.log(`[POINTS] Duplicate beaten points prevented for ${username} on game ${gameId}`);
                }
            }
        }

        // Check mastery (if eligible and not a shadow game)
        if (gameConfig.masteryCheck && !gameConfig.shadowGame && await canAwardPoints(username, gameId, 'mastery')) {
            const totalAchievements = gameAchievements.length;
            const earnedAchievements = gameAchievements.filter(a => parseInt(a.DateEarned) > 0).length;
            
            if (totalAchievements > 0 && totalAchievements === earnedAchievements) {
                const masteryKey = `mastery-${gameId}`;
                const reason = createPointReason(gameConfig.name, "Mastery", masteryKey);
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

                const added = await database.addUserBonusPoints(username, bonusPoint);
                if (added) {
                    pointsToAward.push(bonusPoint);
                    console.log(`[POINTS] Awarded mastery points to ${username} for game ${gameId}`);
                }
            }
        }

        return pointsToAward;
    }
};

function createPointReason(gameName, achievementType, technicalKey) {
    return {
        display: `${gameName} - ${achievementType}`,
        internal: `${gameName} - ${achievementType} (${technicalKey})`
    };
}

module.exports = {
    pointsConfig,
    pointChecks,
    canAwardPoints,
    createPointReason
};

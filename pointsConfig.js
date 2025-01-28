// pointsConfig.js
const database = require('./database');

const pointsConfig = {
    monthlyGames: {
        "319": {  // Chrono Trigger
            name: "Chrono Trigger",
            month: "JANUARY",
            points: {
                mastery: 3  // Available all year
            },
            monthlyOnlyPoints: {  // Only in January
                participation: 1,
                beaten: 3
            },
            progression: [2080, 2081, 2085, 2090, 2191, 2100, 2108, 2129, 2133],
            winCondition: [2266, 2281],
            requireProgression: true,
            requireAllWinConditions: false,
            masteryCheck: true
        },
        "10024": {  // Mario Tennis (January Shadow Game)
            name: "Mario Tennis",
            month: "JANUARY",
            shadowGame: true,
            points: {
                participation: 1,
                beaten: 3
            },
            winCondition: [48411, 48412],
            requireAllWinConditions: false,
            masteryCheck: false,
            active: true
        },
        "355": {  // ALTTP
            name: "The Legend of Zelda: A Link to the Past",
            month: "FEBRUARY",
            points: {
                mastery: 3
            },
            monthlyOnlyPoints: {
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
        "274": {  // UN Squadron (February Shadow Game)
            name: "U.N. Squadron",
            month: "FEBRUARY",
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
            active: false
        }
    }
};

// Helper function to check for existing points
async function hasReceivedPoints(username, gameId, pointType) {
    try {
        const stats = await database.getUserStats();
        const year = new Date().getFullYear().toString();

        if (!stats?.users?.[username]?.bonusPoints) {
            console.log(`[POINTS CHECK] No bonus points found for ${username}`);
            return false;
        }

        const technicalKey = `${pointType}-${gameId}`;

        return stats.users[username].bonusPoints.some(bp => {
            if (bp.year !== year) return false;
            const internalReason = bp.internalReason || bp.reason || '';
            return internalReason.includes(`(${technicalKey})`);
        });
    } catch (error) {
        console.error('Error checking for received points:', error);
        return false;
    }
}

// Helper function to create point reasons
function createPointReason(gameName, achievementType, technicalKey) {
    return {
        display: `${gameName} - ${achievementType}`,
        internal: `${gameName} - ${achievementType} (${technicalKey})`
    };
}

// Helper function to check if points can be awarded
async function canAwardPoints(username, gameId, pointType) {
    const gameConfig = pointsConfig.monthlyGames[gameId];
    if (!gameConfig) return false;

    // Get current month
    const currentMonth = new Date().toLocaleString('default', { month: 'UPPERCASE' }).toUpperCase();
    
    // Shadow games must be active to award any points
    if (gameConfig.shadowGame && !gameConfig.active) return false;

    // Check if point type exists in regular points (mastery)
    if (gameConfig.points[pointType]) return true;

    // Check if point type is month-restricted (participation/beaten)
    if (gameConfig.monthlyOnlyPoints && gameConfig.monthlyOnlyPoints[pointType]) {
        return currentMonth === gameConfig.month;
    }

    return false;
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

        // Don't process inactive shadow games
        if (gameConfig.shadowGame && !gameConfig.active) return [];

        // 1. Participation Check
        const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
        if (hasParticipation && await canAwardPoints(username, gameId, 'participation')) {
            const participationKey = `participation-${gameId}`;
            const reason = createPointReason(gameConfig.name, "Participation", participationKey);
            const bonusPoint = {
                points: gameConfig.monthlyOnlyPoints?.participation || gameConfig.points.participation,
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

        // 2. Beaten Check
        let hasBeaten = true;
        if (gameConfig.requireProgression && gameConfig.progression) {
            hasBeaten = gameConfig.progression.every(achId =>
                gameAchievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0)
            );
            console.log(`[POINTS] Progression check for ${username}: ${hasBeaten}`);
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
            console.log(`[POINTS] Win condition check for ${username}: ${hasBeaten}`);
        }

        if (hasBeaten && await canAwardPoints(username, gameId, 'beaten')) {
            const beatenKey = `beaten-${gameId}`;
            const reason = createPointReason(gameConfig.name, "Game Beaten", beatenKey);
            const bonusPoint = {
                points: gameConfig.monthlyOnlyPoints?.beaten || gameConfig.points.beaten,
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
        } else {
            console.log(`[POINTS] ${username} does not meet beaten criteria for game ${gameId}`);
        }

        // 3. Mastery Check (only for non-shadow games)
        if (gameConfig.masteryCheck && !gameConfig.shadowGame && await canAwardPoints(username, gameId, 'mastery')) {
            const totalAchievements = gameAchievements.length;
            const earnedAchievements = gameAchievements.filter(a => parseInt(a.DateEarned) > 0).length;
            console.log(`[POINTS] ${username} mastery progress: ${earnedAchievements}/${totalAchievements}`);
            
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
                } else {
                    console.log(`[POINTS] Duplicate mastery points prevented for ${username} on game ${gameId}`);
                }
            }
        }

        if (pointsToAward.length > 0) {
            console.log(`[POINTS] Total points awarded to ${username} for game ${gameId}:`, 
                pointsToAward.map(p => `${p.reason}: ${p.points}`).join(', ')
            );
        } else {
            console.log(`[POINTS] No new points to award to ${username} for game ${gameId}`);
        }

        return pointsToAward;
    }
};

module.exports = {
    pointsConfig,
    pointChecks,
    canAwardPoints,
    hasReceivedPoints,
    createPointReason
};

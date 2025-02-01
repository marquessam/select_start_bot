const database = require('./database');

const pointsConfig = {
    monthlyGames: {
        "319": {  // Chrono Trigger
            name: "Chrono Trigger",
            points: { mastery: 3 },
            masteryCheck: true
        },
        "355": {  // ALTTP
            name: "The Legend of Zelda: A Link to the Past",
            points: { mastery: 3, participation: 1, beaten: 3 },
            progression: [944, 2192, 2282, 980, 2288, 2291, 2292, 2296, 2315, 2336, 2351, 
                         2357, 2359, 2361, 2365, 2334, 2354, 2368, 2350, 2372, 2387],
            winCondition: [2389],
            requireProgression: true,
            requireAllWinConditions: true,
            masteryCheck: true
        },
        "274": {  // U.N. Squadron (Shadow Game)
            name: "U.N. Squadron",
            shadowGame: true,
            points: { participation: 1, beaten: 3 },
            progression: [6413, 6414, 6415, 6416, 6417, 6418, 6419, 6420, 6421],
            winCondition: [6422],
            requireProgression: true,
            requireAllWinConditions: true,
            masteryCheck: false,
            active: false
        }
    }
};

async function canAwardPoints(username, gameId, pointType) {
    const gameConfig = pointsConfig.monthlyGames[gameId];
    if (!gameConfig) return false;

    if (gameConfig.shadowGame && !gameConfig.active) return false;
    if (gameId === "319" && pointType !== 'mastery') return false;
    if (!gameConfig.points[pointType]) return false;

    return true;
}

const pointChecks = {
    async checkGamePoints(username, achievements, gameId, userStats) {
        const gameConfig = pointsConfig.monthlyGames[gameId];
        if (!gameConfig) return [];

        const gameAchievements = achievements.filter(a => String(a.GameID || a.gameId) === String(gameId));

        const pointsToAward = [];

        // 🟢 Participation Check (If Not Chrono Trigger)
        if (gameId !== "319" && gameConfig.points.participation) {
            const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);

            if (hasParticipation && await canAwardPoints(username, gameId, 'participation')) {
                const participationKey = `participation-${gameId}`;
                const reason = createPointReason(gameConfig.name, "Participation", participationKey);
                const bonusPoint = createBonusPointObject(username, gameId, gameConfig.points.participation, 'participation', reason);

                if (await database.addUserBonusPoints(username, bonusPoint)) {
                    pointsToAward.push(bonusPoint);
                }
            }
        }

        // 🟢 Beaten Check (If Not Chrono Trigger)
        if (gameId !== "319" && gameConfig.points.beaten) {
            let hasBeaten = gameConfig.requireProgression 
                ? gameConfig.progression.every(achId => gameAchievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0))
                : true;

            if (hasBeaten && gameConfig.requireAllWinConditions) {
                hasBeaten = gameConfig.winCondition.every(achId => gameAchievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0));
            } else if (hasBeaten) {
                hasBeaten = gameConfig.winCondition.some(achId => gameAchievements.some(a => parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0));
            }

            if (hasBeaten && await canAwardPoints(username, gameId, 'beaten')) {
                const beatenKey = `beaten-${gameId}`;
                const reason = createPointReason(gameConfig.name, "Game Beaten", beatenKey);
                const bonusPoint = createBonusPointObject(username, gameId, gameConfig.points.beaten, 'beaten', reason);

                if (await database.addUserBonusPoints(username, bonusPoint)) {
                    pointsToAward.push(bonusPoint);
                }
            }
        }

        // 🟢 Mastery Check
        if (gameConfig.masteryCheck && !gameConfig.shadowGame && await canAwardPoints(username, gameId, 'mastery')) {
            const totalAchievements = gameAchievements.length;
            const earnedAchievements = gameAchievements.filter(a => parseInt(a.DateEarned) > 0).length;

            if (totalAchievements > 0 && totalAchievements === earnedAchievements) {
                const masteryKey = `mastery-${gameId}`;
                const reason = createPointReason(gameConfig.name, "Mastery", masteryKey);
                const bonusPoint = createBonusPointObject(username, gameId, gameConfig.points.mastery, 'mastery', reason);

                if (await database.addUserBonusPoints(username, bonusPoint)) {
                    pointsToAward.push(bonusPoint);
                }
            }
        }

        return pointsToAward;
    }
};

// 🟢 Helper Function: Create Bonus Point Object
function createBonusPointObject(username, gameId, points, pointType, reason) {
    return {
        points,
        reason: reason.display,
        internalReason: reason.internal,
        technicalKey: `${pointType}-${gameId}`,
        pointType,
        gameId,
        year: new Date().getFullYear().toString(),
        date: new Date().toISOString()
    };
}

// 🟢 Helper Function: Create Reason String
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

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

/**
 * Checks if the user has already received points for a specific game and point type.
 * @param {Object} userStats - The user's statistics object.
 * @param {string} gameId - The ID of the game.
 * @param {string} pointType - The type of points ('participation', 'beaten', 'mastery').
 * @returns {boolean} - True if points have already been awarded, false otherwise.
 */
function hasReceivedPoints(userStats, gameId, pointType) {
    // First check if the user has any bonus points
    if (!userStats?.bonusPoints || !Array.isArray(userStats.bonusPoints)) {
        return false;
    }
    
    // Get current year to check only relevant points
    const currentYear = new Date().getFullYear().toString();
    
    // Create the technical key we're looking for
    const technicalKey = `${pointType}-${gameId}`;
    
    // Check if points were already awarded this year
    return userStats.bonusPoints.some(bp => {
        // Only check points from current year
        if (bp.year !== currentYear) {
            return false;
        }

        // Check both internalReason and regular reason fields
        const reasonToCheck = bp.internalReason || bp.reason || '';
        return reasonToCheck.includes(technicalKey);
    });
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

// Debug function to help track point awards
async function debugUserPoints(username, gameId) {
    const userStats = await database.getUserStats(username);
    const currentYear = new Date().getFullYear().toString();
    
    console.log(`=== Debug Points for ${username} ===`);
    console.log('Current Year:', currentYear);
    console.log('Game ID:', gameId);
    
    if (userStats?.bonusPoints) {
        console.log('\nBonus Points History:');
        userStats.bonusPoints.forEach(bp => {
            console.log(`- Year: ${bp.year}`);
            console.log(`  Points: ${bp.points}`);
            console.log(`  Reason: ${bp.reason}`);
            console.log(`  Internal Reason: ${bp.internalReason || 'N/A'}`);
            console.log('---');
        });
    }
    
    // Check current points status
    ['participation', 'beaten', 'mastery'].forEach(pointType => {
        const hasPoints = hasReceivedPoints(userStats, gameId, pointType);
        console.log(`Has ${pointType} points: ${hasPoints}`);
    });
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
    async function checkGamePoints(username, achievements, gameId, userStats) {
    console.log(`[POINTS] Checking ${username}'s points for game ${gameId}`);
    
    const gameConfig = pointsConfig.monthlyGames[gameId];
    if (!gameConfig) {
        console.log(`[POINTS] No config found for game ${gameId}`);
        return [];
    }

    // Get all achievements for this game first
    const gameAchievements = achievements.filter(a => {
        const achievementGameId = String(a.GameID || a.gameId);
        return achievementGameId === String(gameId);
    });

    console.log(`[POINTS] Found ${gameAchievements.length} achievements for game ${gameId}`);

    // Create an array to store all point awards
    const pointsToAward = [];

    // Check participation first
    const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
    
    // Instead of awarding points one at a time, collect all valid point awards
    if (hasParticipation) {
        const participationKey = `participation-${gameId}`;
        const reason = createPointReason(gameConfig.name, "Participation", participationKey);
        pointsToAward.push({
            points: gameConfig.points.participation,
            reason: reason.display,
            internalReason: reason.internal,
            technicalKey: participationKey,
            pointType: 'participation',
            gameId
        });
    }

    // Check beaten status
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
        pointsToAward.push({
            points: gameConfig.points.beaten,
            reason: reason.display,
            internalReason: reason.internal,
            technicalKey: beatenKey,
            pointType: 'beaten',
            gameId
        });
    }

    // Check mastery if applicable
    if (gameConfig.masteryCheck) {
        const totalAchievements = gameAchievements.length;
        const earnedAchievements = gameAchievements.filter(a => 
            parseInt(a.DateEarned) > 0
        ).length;
        
        if (totalAchievements > 0 && totalAchievements === earnedAchievements) {
            const masteryKey = `mastery-${gameId}`;
            const reason = createPointReason(gameConfig.name, "Mastery", masteryKey);
            pointsToAward.push({
                points: gameConfig.points.mastery,
                reason: reason.display,
                internalReason: reason.internal,
                technicalKey: masteryKey,
                pointType: 'mastery',
                gameId
            });
        }
    }

    // Now, for each point award we want to give, check if it's already been awarded
    const validPoints = [];
    for (const award of pointsToAward) {
        // Check if these points have already been awarded
        const normalizedReason = award.internalReason.toLowerCase().replace(/\s+/g, ' ').trim();
        const alreadyAwarded = await hasReceivedPoints(userStats.database, username, normalizedReason);
        
        if (!alreadyAwarded) {
            validPoints.push(award);
        } else {
            console.log(`[POINTS] ${username} already received points for ${normalizedReason}`);
        }
    }

    if (validPoints.length > 0) {
        console.log(`[POINTS] Points to award to ${username} for game ${gameId}:`, 
            validPoints.map(p => `${p.reason}: ${p.points}`).join(', ')
        );
    }

    // Return only the points that haven't been awarded yet
    return validPoints;
}

// Add a new helper function to check for existing points
async function hasReceivedPoints(database, username, normalizedReason) {
    try {
        const collection = await database.getCollection('userstats');
        const stats = await collection.findOne({ _id: 'stats' });
        const year = new Date().getFullYear().toString();

        if (!stats?.users?.[username]?.bonusPoints) {
            return false;
        }

        return stats.users[username].bonusPoints.some(bp => {
            const existingReason = (bp.internalReason || bp.reason || '')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();
            return bp.year === year && existingReason === normalizedReason;
        });
    } catch (error) {
        console.error('Error checking for received points:', error);
        return false;
    }
}

module.exports = {
    pointsConfig,
    pointChecks: {
        checkGamePoints
    }
};

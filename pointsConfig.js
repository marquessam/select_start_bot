// pointsConfig.js
const database = require('./database');

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

// Helper function to check for existing points
async function hasReceivedPoints(username, gameId, pointType) {
    try {
        const stats = await database.getUserStats();
        const year = new Date().getFullYear().toString();

        if (!stats?.users?.[username]?.bonusPoints) {
            console.log(`[POINTS CHECK] No bonus points found for ${username}`);
            return false;
        }

        // Create the technical key we're looking for
        const technicalKey = `${pointType}-${gameId}`;

        // Check if points exist for this exact technical key
        const hasPoints = stats.users[username].bonusPoints.some(bp => {
            // Check if it's a bonus point from this year
            if (bp.year !== year) return false;

            // Look for the technical key in the internal reason
            const internalReason = bp.internalReason || bp.reason || '';
            const hasMatch = internalReason.includes(`(${technicalKey})`);
            
            if (hasMatch) {
                console.log(`[POINTS CHECK] Found existing ${pointType} points for ${username} on game ${gameId}`);
            }
            
            return hasMatch;
        });

        return hasPoints;
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

// Point checking object
const pointChecks = {
    async checkGamePoints(username, achievements, gameId, userStats) {
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

        // Check each type of points in sequence
        
        // 1. Participation Check
        const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
        if (hasParticipation) {
            // Check if already has participation points
            const hasExistingParticipation = await hasReceivedPoints(username, gameId, 'participation');
            if (!hasExistingParticipation) {
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
                console.log(`[POINTS] ${username} eligible for participation points`);
            } else {
                console.log(`[POINTS] ${username} already has participation points`);
            }
        }

        // 2. Beaten Check
        let hasBeaten = true;
        if (gameConfig.requireProgression && gameConfig.progression) {
            hasBeaten = gameConfig.progression.every(achId =>
                gameAchievements.some(a => 
                    parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                )
            );
            console.log(`[POINTS] Progression check for ${username}: ${hasBeaten}`);
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
            console.log(`[POINTS] Win condition check for ${username}: ${hasBeaten}`);

            if (hasBeaten) {
                // Check if already has beaten points
                const hasExistingBeaten = await hasReceivedPoints(username, gameId, 'beaten');
                if (!hasExistingBeaten) {
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
                    console.log(`[POINTS] ${username} eligible for beaten points`);
                } else {
                    console.log(`[POINTS] ${username} already has beaten points`);
                }
            }
        }

        // 3. Mastery Check
        if (gameConfig.masteryCheck) {
            const totalAchievements = gameAchievements.length;
            const earnedAchievements = gameAchievements.filter(a => 
                parseInt(a.DateEarned) > 0
            ).length;
            
            console.log(`[POINTS] ${username} mastery progress: ${earnedAchievements}/${totalAchievements}`);
            
            if (totalAchievements > 0 && totalAchievements === earnedAchievements) {
                // Check if already has mastery points
                const hasExistingMastery = await hasReceivedPoints(username, gameId, 'mastery');
                if (!hasExistingMastery) {
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
                    console.log(`[POINTS] ${username} eligible for mastery points`);
                } else {
                    console.log(`[POINTS] ${username} already has mastery points`);
                }
            }
        }

        if (pointsToAward.length > 0) {
            console.log(`[POINTS] Points to award to ${username} for game ${gameId}:`, 
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
    pointChecks
};

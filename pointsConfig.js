// pointsConfig.js

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
function hasReceivedPoints(userStats, gameId, pointType) {
    if (!userStats.bonusPoints || !Array.isArray(userStats.bonusPoints)) {
        return false;
    }
    
    const exactKey = `${pointType}-${gameId}`;
    return userStats.bonusPoints.some(bp => {
        // First try to get the technical key from internalReason
        const technicalKey = bp.internalReason?.split('(')[1]?.split(')')[0];
        
        // If that doesn't exist, try to extract it from reason
        const fallbackKey = bp.reason?.split('(')[1]?.split(')')[0];
        
        // Compare the exact key to either the technical key or fallback
        return technicalKey === exactKey || fallbackKey === exactKey;
    });
}

function createPointReason(gameName, achievementType, technicalKey) {
    return {
        display: `${gameName} - ${achievementType}`,
        internal: `${gameName} - ${achievementType} (${technicalKey})`
    };
}

const pointChecks = {
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

        // Check participation
        const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
        if (hasParticipation && !hasReceivedPoints(userStats, gameId, 'participation')) {
            const participationKey = `participation-${gameId}`;
            const reason = createPointReason(gameConfig.name, "Participation", participationKey);
            points.push({
                points: gameConfig.points.participation,
                reason: reason.display,
                internalReason: reason.internal
            });
            console.log(`[POINTS] Adding participation point for ${username}`);
        }

        // Check beaten status
        if (!hasReceivedPoints(userStats, gameId, 'beaten')) {
            let hasBeaten = true;

            // Check progression achievements if required
            if (gameConfig.requireProgression && gameConfig.progression) {
                hasBeaten = gameConfig.progression.every(achId =>
                    gameAchievements.some(a => 
                        parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                    )
                );
            }

            // Check win conditions
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
                    internalReason: reason.internal
                });
                console.log(`[POINTS] Adding beaten points for ${username}`);
            }
        }

        // Check mastery if applicable
        if (gameConfig.masteryCheck && !hasReceivedPoints(userStats, gameId, 'mastery')) {
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
                    internalReason: reason.internal
                });
                console.log(`[POINTS] Adding mastery points for ${username}`);
            }
        }

        if (points.length > 0) {
            console.log(`[POINTS] Total points awarded to ${username} for game ${gameId}:`, 
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

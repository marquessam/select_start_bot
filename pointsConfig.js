// pointsConfig.js

const pointsConfig = {
    // Monthly challenges
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

// Helper function to create point reasons
function createPointReason(gameName, achievementType, technicalKey) {
    return {
        display: `${gameName} - ${achievementType}`, // User-facing reason
        internal: `${gameName} - ${achievementType} (${technicalKey})` // Internal reason with key
    };
}

const pointChecks = {
    async checkGamePoints(username, achievements, gameId, userStats) {
        const gameConfig = pointsConfig.monthlyGames[gameId];
        if (!gameConfig) return [];

        const points = [];
        const gameAchievements = achievements.filter(a => 
            a.GameID === gameId || a.GameID === parseInt(gameId)
        );

        // Check participation
        const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
        const participationKey = `participation-${gameId}`;
        if (hasParticipation && !userStats.bonusPoints?.some(bp => 
            bp.reason.includes(participationKey)
        )) {
            const reason = createPointReason(gameConfig.name, "Participation", participationKey);
            points.push({
                points: gameConfig.points.participation,
                reason: reason.display,
                internalReason: reason.internal
            });
        }

        // Check beaten condition
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
            if (!userStats.bonusPoints?.some(bp => 
                bp.reason.includes(beatenKey)
            )) {
                const reason = createPointReason(gameConfig.name, "Game Beaten", beatenKey);
                points.push({
                    points: gameConfig.points.beaten,
                    reason: reason.display,
                    internalReason: reason.internal
                });
            }
        }

        // Check mastery if applicable
        if (gameConfig.masteryCheck) {
            const totalAchievements = gameAchievements.length;
            const earnedAchievements = gameAchievements.filter(a => 
                parseInt(a.DateEarned) > 0
            ).length;
            
            const hasMastery = totalAchievements > 0 && totalAchievements === earnedAchievements;
            const masteryKey = `mastery-${gameId}`;
            
            if (hasMastery && !userStats.bonusPoints?.some(bp => 
                bp.reason.includes(masteryKey)
            )) {
                const reason = createPointReason(gameConfig.name, "Mastery", masteryKey);
                points.push({
                    points: gameConfig.points.mastery,
                    reason: reason.display,
                    internalReason: reason.internal
                });
            }
        }

        return points;
    }
};

module.exports = {
    pointsConfig,
    pointChecks
};

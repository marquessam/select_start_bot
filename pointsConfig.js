// pointsConfig.js

const BETA_MEMBER_ROLE = '1301710526535041105';

const pointsConfig = {
    // Role-based points
    roles: [
        {
            roleId: BETA_MEMBER_ROLE,
            points: 1,
            reason: 'Beta Member'
        }
    ],

    // Monthly challenges
    monthlyGames: {
        // Chrono Trigger
        '319': {
            points: {
                participation: 1,
                beaten: 3,
                mastery: 3
            },
            progression: [2080, 2081, 2085, 2090, 2191, 2100, 2108, 2129, 2133],
            winCondition: [2266, 2281],
            requireProgression: true,  // Must have progression achievements
            requireAllWinConditions: true,  // Must have ALL win condition achievements
            masteryCheck: true  // This game awards mastery points
        },
        // Mario Tennis
        '10024': {
            points: {
                participation: 1,
                beaten: 3
            },
            winCondition: [48411, 48412],
            requireProgression: false,  // No progression achievements needed
            requireAllWinConditions: false,  // Only need ONE win condition achievement
            masteryCheck: false  // This game does not award mastery points
        }
    }
};

// Point check functions
const pointChecks = {
    // Check if user has role-based points
    async checkRolePoints(user, userStats) {
        const roleChecks = [];
        for (const roleConfig of pointsConfig.roles) {
            if (user.roles?.cache.has(roleConfig.roleId)) {
                const pointKey = `role-${roleConfig.roleId}`;
                if (!userStats.bonusPoints?.some(bp => bp.reason.includes(pointKey))) {
                    roleChecks.push({
                        points: roleConfig.points,
                        reason: `${roleConfig.reason} (${pointKey})`
                    });
                }
            }
        }
        return roleChecks;
    },

    // Check game-related points
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
            points.push({
                points: gameConfig.points.participation,
                reason: `Game Participation - ${gameId} (${participationKey})`
            });
        }

        // Check beaten condition
        let hasBeaten = true;

        // Check progression achievements if required
        if (gameConfig.requireProgression && gameConfig.progression) {
            hasBeaten = gameConfig.progression.every(achId =>
                gameAchievements.some(a => 
                    parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                )
            );
        }

        // Check win condition achievements
        if (hasBeaten) {  // Only check win conditions if progression is met
            if (gameConfig.requireAllWinConditions) {
                // Need all win condition achievements
                hasBeaten = gameConfig.winCondition.every(achId =>
                    gameAchievements.some(a => 
                        parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                    )
                );
            } else {
                // Need at least one win condition achievement
                hasBeaten = gameConfig.winCondition.some(achId =>
                    gameAchievements.some(a => 
                        parseInt(a.ID) === achId && parseInt(a.DateEarned) > 0
                    )
                );
            }
        }

        const beatenKey = `beaten-${gameId}`;
        if (hasBeaten && !userStats.bonusPoints?.some(bp => 
            bp.reason.includes(beatenKey)
        )) {
            points.push({
                points: gameConfig.points.beaten,
                reason: `Game Beaten - ${gameId} (${beatenKey})`
            });
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
                points.push({
                    points: gameConfig.points.mastery,
                    reason: `Game Mastery - ${gameId} (${masteryKey})`
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
module.exports = {
    pointsConfig,
    pointChecks
};

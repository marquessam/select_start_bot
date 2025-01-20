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

// Point awarding checks
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

        // 1. Participation Check
        const hasParticipation = gameAchievements.some(a => parseInt(a.DateEarned) > 0);
        if (hasParticipation && !await hasReceivedPoints(username, gameId, 'participation')) {
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
            const bonusPoint = {
                points: gameConfig.points.participation,
                reason: reason.display,
                internalReason: reason.internal,
                year: new Date().getFullYear().toString(),
                date: new Date().toISOString()
            };
            await database.addUserBonusPoints(username, bonusPoint);
        } else {
            console.log(`[POINTS] ${username} already has participation points for game ${gameId}`);
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
        }

        if (hasBeaten && !await hasReceivedPoints(username, gameId, 'beaten')) {
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
            const bonusPoint = {
                points: gameConfig.points.beaten,
                reason: reason.display,
                internalReason: reason.internal,
                year: new Date().getFullYear().toString(),
                date: new Date().toISOString()
            };
            await database.addUserBonusPoints(username, bonusPoint);
        } else if (!hasBeaten) {
            console.log(`[POINTS] ${username} does not meet beaten criteria for game ${gameId}`);
        } else {
            console.log(`[POINTS] ${username} already has beaten points for game ${gameId}`);
        }

        // 3. Mastery Check
        if (gameConfig.masteryCheck) {
            const totalAchievements = gameAchievements.length;
            const earnedAchievements = gameAchievements.filter(a => 
                parseInt(a.DateEarned) > 0
            ).length;
            
            console.log(`[POINTS] ${username} mastery progress: ${earnedAchievements}/${totalAchievements}`);
            
            if (totalAchievements > 0 && totalAchievements === earnedAchievements &&
                !await hasReceivedPoints(username, gameId, 'mastery')) {
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
                const bonusPoint = {
                    points: gameConfig.points.mastery,
                    reason: reason.display,
                    internalReason: reason.internal,
                    year: new Date().getFullYear().toString(),
                    date: new Date().toISOString()
                };
                await database.addUserBonusPoints(username, bonusPoint);
            } else if (totalAchievements > 0 && totalAchievements === earnedAchievements) {
                console.log(`[POINTS] ${username} already has mastery points for game ${gameId}`);
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

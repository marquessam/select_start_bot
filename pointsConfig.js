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
};

module.exports = {
    pointsConfig,
    pointChecks
};

// achievementSystem.js
const monthConfig = require('./monthConfig');

class AchievementSystem {
    constructor(database, raAPI) {
        this.database = database;
        this.raAPI = raAPI;
    }

    /**
     * Main method called when a new RA achievement is detected for a user.
     * Checks if the game is monthly/shadow for any relevant month, then awards points.
     */
    async processAchievement(username, achievement) {
        try {
            const gameId = achievement.GameID;

            // Current month key like "2025-02"
            const now = new Date();
            const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            // Check all monthConfig entries (like "2025-01", "2025-02", etc.)
            for (const [key, games] of Object.entries(monthConfig)) {
                const { monthlyGame, shadowGame } = games;

                // Skip if game doesn't match monthly or shadow for this config entry
                if (gameId !== monthlyGame && gameId !== shadowGame) {
                    continue;
                }

                // If key is in the future, skip awarding
                if (key > currentKey) {
                    continue;
                }

                // Determine if it's monthly or shadow, and if it's a past month
                const isShadow = (gameId === shadowGame);
                const isMonthly = (gameId === monthlyGame);
                const isPastMonth = (key < currentKey);

                // Past shadow awarding is skipped
                if (isShadow && isPastMonth) {
                    continue;
                }

                // Fetch the user’s RA progress
                const gameProgress = await this.raAPI.fetchCompleteGameProgress(username, gameId);
                if (!gameProgress) {
                    continue;
                }

                // Convert RA's highestAwardKind → 'participation', 'beaten', 'mastered'
                const newAward = this.determineAward(gameProgress.highestAwardKind, isMonthly);
                if (!newAward) {
                    continue;
                }

                // If it's a past monthly month, only mastery awarding is allowed
                if (isMonthly && isPastMonth && newAward !== 'mastered') {
                    continue;
                }

                // Save or update the user's record in achievement_records
                await this.saveOrUpdateRecord(username, gameId, key, newAward);
            }
        } catch (error) {
            console.error('[ACHIEVEMENT SYSTEM] processAchievement error:', error);
        }
    }

    /**
     * Convert RA's "mastered" to "beaten" if it's a shadow game (no mastery).
     * Otherwise keep as is.
     */
    determineAward(highestAwardKind, isMonthly) {
        if (!highestAwardKind) return null;

        // For shadow: "mastered" → treat as "beaten"
        if (!isMonthly && highestAwardKind === 'mastered') {
            return 'beaten';
        }

        // Could be "participation", "beaten", or "mastered"
        return highestAwardKind;
    }

    /**
     * Insert or update a record in `achievement_records`.
     * key is like "2025-02" => split into year="2025", month="02".
     */
    async saveOrUpdateRecord(username, gameId, monthKey, newAward) {
        const [year, rawMonth] = monthKey.split('-');
        const month = rawMonth.padStart(2, '0');

        const coll = await this.database.getCollection('achievement_records');
        const existing = await coll.findOne({ username, gameId, year, month });

        if (!existing) {
            // Create a new record
            const doc = {
                username,
                gameId,
                year,
                month,
                award: newAward, // 'participation', 'beaten', or 'mastered'
                date: new Date().toISOString()
            };
            await coll.insertOne(doc);
            console.log(`[AchievementSystem] Inserted record: ${username}, game=${gameId}, ${year}-${month}, award=${newAward}`);
        } else {
            // If the user’s new award outranks the old one, update it
            const oldRank = this.awardRank(existing.award);
            const newRank = this.awardRank(newAward);
            if (newRank > oldRank) {
                await coll.updateOne(
                    { _id: existing._id },
                    { $set: { award: newAward } }
                );
                console.log(`[AchievementSystem] Upgraded award for ${username}, game=${gameId}, ${existing.award}→${newAward}`);
            }
        }
    }

    // Convert 'participation'/'beaten'/'mastered' → numeric rank for comparison
    awardRank(award) {
        switch (award) {
            case 'participation': return 1;
            case 'beaten':        return 2;
            case 'mastered':      return 3;
            default:              return 0;
        }
    }

    /**
     * Summarize a user’s points for a given month/year or entire year.
     * Reads from `achievement_records`, sums using `pointsForAward()`.
     */
    async calculatePoints(username, queryMonth = null, queryYear = null) {
        const coll = await this.database.getCollection('achievement_records');

        const query = { username };
        if (queryMonth && queryYear) {
            // Convert month to string before padStart
            query.year = queryYear;
            query.month = String(queryMonth).padStart(2, '0');
        } else if (queryYear) {
            query.year = queryYear;
        }

        const records = await coll.find(query).toArray();

        let totalPoints = 0;
        const breakdown = [];

        for (const r of records) {
            const points = this.pointsForAward(r.award, r.gameId, r.year, r.month);
            totalPoints += points;
            breakdown.push({
                gameId: r.gameId,
                year: r.year,
                month: r.month,
                award: r.award,
                points
            });
        }

        return { total: totalPoints, breakdown };
    }

    /**
     * Convert an award + game/month data → numeric points.
     * - monthly: participation=1, beaten=4, mastered=7
     * - shadow:  participation=1, beaten=4, (mastered=4 if forced)
     */
    pointsForAward(award, gameId, year, month) {
        const key = `${year}-${month}`;
        const cfg = monthConfig[key];
        if (!cfg) {
            return 0; // no config for that month => no points
        }

        const isMonthly = (cfg.monthlyGame === gameId);
        const isShadow = (cfg.shadowGame === gameId);

        switch (award) {
            case 'participation':
                return 1;
            case 'beaten':
                return 4; // implies 1 + 3
            case 'mastered':
                if (isMonthly) return 7; // 1 + 3 + 3
                // shadow normally can't master, fallback to 4
                return 4;
            default:
                return 0;
        }
    }

    /**
     * Provide monthly vs. shadow game(s) for a given month/year:
     * returns { monthly: [], shadow: [] }.
     */
    getMonthlyGames(month, year) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const cfg = monthConfig[key];

        if (!cfg) {
            return { monthly: [], shadow: [] };
        }

        // Return them as arrays
        return {
            monthly: cfg.monthlyGame ? [cfg.monthlyGame] : [],
            shadow: cfg.shadowGame ? [cfg.shadowGame] : []
        };
    }
}

module.exports = AchievementSystem;

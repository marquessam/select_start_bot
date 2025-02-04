// achievementSystem.js
const monthConfig = require('./monthConfig');

class AchievementSystem {
    constructor(database, raAPI) {
        this.database = database;
        this.raAPI = raAPI;
    }

    /**
     * Called whenever the bot detects a new RA achievement for a user.
     * 1) Finds if the game is in monthConfig for any month <= current month.
     * 2) If it's a past month for a monthly game, only mastery is valid.
     * 3) If it's a past month for a shadow game, skip awarding.
     * 4) Inserts/updates the user's record in `achievement_records`.
     */
    async processAchievement(username, achievement) {
        try {
            const gameId = achievement.GameID;
            // Current month key like "2025-02"
            const now = new Date();
            const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            // Check all months in our config to see if gameId matches monthly or shadow
            for (const [key, games] of Object.entries(monthConfig)) {
                const { monthlyGame, shadowGame } = games;
                if (gameId !== monthlyGame && gameId !== shadowGame) {
                    continue;
                }

                // If it's a future month, skip awarding
                if (key > currentKey) {
                    continue;
                }

                // Check if this is monthly or shadow
                const isShadow = (gameId === shadowGame);
                const isMonthly = !isShadow;
                const isPastMonth = (key < currentKey);

                // If it’s a shadow game in a past month, skip awarding
                if (isShadow && isPastMonth) {
                    continue;
                }

                // Fetch RA data for user’s progress in this game
                const gameProgress = await this.raAPI.fetchCompleteGameProgress(username, gameId);
                if (!gameProgress) {
                    continue;
                }

                // Convert RA's "highestAwardKind" into 'participation', 'beaten', or 'mastered'
                const newAward = this.determineAward(gameProgress.highestAwardKind, isMonthly);
                if (!newAward) {
                    continue;
                }

                // If it’s a past monthly month, only mastery is valid
                if (isMonthly && isPastMonth && newAward !== 'mastered') {
                    // user only has participation or beaten in a past month => no awarding
                    continue;
                }

                // Save or update record
                await this.saveOrUpdateRecord(username, gameId, key, newAward);
            }
        } catch (error) {
            console.error('[ACHIEVEMENT SYSTEM] processAchievement error:', error);
        }
    }

    /**
     * Convert RA's 'mastered' to 'beaten' if the game is shadow,
     * because shadow has no mastery. Otherwise keep as-is.
     */
    determineAward(highestAwardKind, isMonthly) {
        if (!highestAwardKind) return null;
        if (!isMonthly && highestAwardKind === 'mastered') {
            // For shadow game, treat mastery as beaten
            return 'beaten';
        }
        return highestAwardKind; // 'participation', 'beaten', 'mastered'
    }

    /**
     * Insert or update a single record in `achievement_records`.
     * The record has { username, gameId, year, month, award }.
     * If user’s new award outranks the old one, we update the record.
     */
    async saveOrUpdateRecord(username, gameId, monthKey, newAward) {
        const [year, rawMonth] = monthKey.split('-'); // e.g. "2025-02" => year=2025, rawMonth="02"
        const month = rawMonth.padStart(2, '0');

        const coll = await this.database.getCollection('achievement_records');
        const existing = await coll.findOne({ username, gameId, year, month });

        if (!existing) {
            // Create new
            const doc = {
                username,
                gameId,
                year,
                month,
                award: newAward,  // 'participation', 'beaten', 'mastered'
                date: new Date().toISOString()
            };
            await coll.insertOne(doc);
            console.log(`[AchievementSystem] Inserted record: ${username}, game=${gameId}, ${year}-${month}, award=${newAward}`);
        } else {
            // Update only if newAward outranks old
            const oldRank = this.awardRank(existing.award);
            const newRank = this.awardRank(newAward);
            if (newRank > oldRank) {
                await coll.updateOne(
                    { _id: existing._id },
                    { $set: { award: newAward } }
                );
                console.log(`[AchievementSystem] Upgraded award for ${username}, game=${gameId}, from ${existing.award} to ${newAward}`);
            }
        }
    }

    // Helper: numeric rank for each award
    awardRank(award) {
        switch (award) {
            case 'participation': return 1;
            case 'beaten': return 2;
            case 'mastered': return 3;
            default: return 0;
        }
    }

    /**
     * Summarize a user’s points for a given month/year or entire year.
     * Reads from `achievement_records` and sums using pointsForAward().
     */
    async calculatePoints(username, queryMonth = null, queryYear = null) {
        const coll = await this.database.getCollection('achievement_records');

        const query = { username };
        if (queryMonth && queryYear) {
            query.year = queryYear;
            query.month = queryMonth.padStart(2, '0');
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

        return { totalPoints, breakdown };
    }

    /**
     * Convert 'participation', 'beaten', 'mastered' into actual points,
     * depending on if it's monthly or shadow. 
     * - monthly => 'participation'=1, 'beaten'=4, 'mastered'=7
     * - shadow => 'participation'=1, 'beaten'=4 (mastery => 4)
     */
    pointsForAward(award, gameId, year, month) {
        // figure out if game is monthly or shadow in that year-month
        const key = `${year}-${month.padStart(2, '0')}`;
        const config = monthConfig[key];
        if (!config) return 0; // no entry => no points

        const isMonthly = (gameId === config.monthlyGame);
        const isShadow = (gameId === config.shadowGame);

        if (award === 'participation') {
            return 1;
        }
        if (award === 'beaten') {
            return 4; // implies participation+beaten = 1+3
        }
        if (award === 'mastered') {
            if (isMonthly) return 7; // 1+3+3
            // shadow normally can't be 'mastered', but if forced => treat as beaten=4
            return 4;
        }
        return 0;
    }

    /**
     * Provide the monthly/shadow game(s) for the given month/year
     * in the form: { monthly: [...], shadow: [...] }.
     * This method is used by your leaderboardCache or other code that
     * expects to see which game IDs are relevant for that month.
     */
    getMonthlyGames(month, year) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const cfg = monthConfig[key];
        if (!cfg) {
            return { monthly: [], shadow: [] };
        }
        return {
            monthly: cfg.monthlyGame ? [cfg.monthlyGame] : [],
            shadow: cfg.shadowGame ? [cfg.shadowGame] : []
        };
    }
}

module.exports = AchievementSystem;

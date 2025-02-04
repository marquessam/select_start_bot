// achievementSystem.js

const monthConfig = require('./monthConfig');

class AchievementSystem {
  constructor(database, raAPI) {
    this.database = database;
    this.raAPI = raAPI;
  }

  /**
   * Called whenever a new achievement is detected from RA.
   * We figure out if it's relevant to a monthly or shadow game
   * (either current month or a past month for mastery).
   */
  async processAchievement(username, achievement) {
    try {
      const gameId = achievement.GameID;
      // We'll check all entries in monthConfig to see if this game is monthlyGame or shadowGame
      const now = new Date();
      const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      for (const [key, games] of Object.entries(monthConfig)) {
        const { monthlyGame, shadowGame } = games;
        if (gameId !== monthlyGame && gameId !== shadowGame) {
          continue; // Not relevant for that month
        }

        // If the month is in the future, skip awarding
        if (key > currentKey) {
          continue;
        }

        // If it's a shadow game and the key < currentKey (a past month), skip awarding entirely
        const isShadow = (gameId === shadowGame);
        const isMonthly = !isShadow; // or (gameId === monthlyGame);

        const isPastMonth = (key < currentKey);
        if (isShadow && isPastMonth) {
          // Shadow awarding is only valid in the actual month
          continue;
        }

        // Now fetch user progress from RA to see if they're at participation, beaten, or mastery
        const gameProgress = await this.raAPI.fetchCompleteGameProgress(username, gameId);
        if (!gameProgress) {
          continue;
        }

        // Convert RA's data to an internal "award" string: participation, beaten, mastered
        const newAward = this.determineAward(gameProgress.highestAwardKind, isMonthly);

        if (!newAward) {
          continue;
        }

        // If it's a PAST monthly month, we only allow awarding mastery
        if (isPastMonth && isMonthly && newAward !== 'mastered') {
          // That means user is only at participation or beaten after the month ended, skip
          continue;
        }

        // Save or update the record
        await this.saveOrUpdateRecord(username, gameId, key, newAward);
      }
    } catch (error) {
      console.error('[ACHIEVEMENT SYSTEM] processAchievement error:', error);
    }
  }

  /**
   * "highestAwardKind" from RA is usually "mastered", "beaten", "participation", or null
   * If it's shadow, we don't do mastery, so we treat "mastered" as "beaten".
   */
  determineAward(highestAwardKind, isMonthly) {
    if (!highestAwardKind) return null;
    if (!isMonthly && highestAwardKind === 'mastered') {
      // For shadow, there's no mastery, treat it as beaten
      return 'beaten';
    }
    return highestAwardKind; // 'participation', 'beaten', or 'mastered'
  }

  /**
   * Insert or update a single record in `achievement_records` for the user+game+month.
   * If the user’s new award outranks the old one, we update it.
   */
  async saveOrUpdateRecord(username, gameId, monthKey, newAward) {
    const [year, month] = monthKey.split('-'); // "2025-01" => year=2025, month=01

    const collection = await this.database.getCollection('achievement_records');
    const existing = await collection.findOne({ username, gameId, year, month });

    if (!existing) {
      // Insert brand new record
      const doc = {
        username,
        gameId,
        year,
        month,
        award: newAward, // 'participation' | 'beaten' | 'mastered'
        date: new Date().toISOString()
      };
      await collection.insertOne(doc);
      console.log(`[AchievementSystem] Inserted new record: ${username}, game ${gameId}, ${monthKey}, ${newAward}`);
    } else {
      // If the user’s new award outranks the old one, update
      const oldRank = this.awardRank(existing.award);
      const newRank = this.awardRank(newAward);
      if (newRank > oldRank) {
        await collection.updateOne(
          { _id: existing._id },
          { $set: { award: newAward } }
        );
        console.log(`[AchievementSystem] Upgraded record: ${username}, game ${gameId}, from ${existing.award} to ${newAward}`);
      }
    }
  }

  awardRank(award) {
    switch (award) {
      case 'participation': return 1;
      case 'beaten': return 2;
      case 'mastered': return 3;
      default: return 0;
    }
  }

  /**
   * Summarizes a user’s points for a given month+year or entire year.
   * It reads `achievement_records` and sums the points for each award.
   */
  async calculatePoints(username, queryMonth = null, queryYear = null) {
    const collection = await this.database.getCollection('achievement_records');

    const query = { username };
    if (queryMonth && queryYear) {
      query.year = queryYear;
      query.month = queryMonth.padStart(2, '0');
    } else if (queryYear) {
      query.year = queryYear;
    }

    const records = await collection.find(query).toArray();
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
   * Convert the single 'award' (participation, beaten, mastered) into total points
   * for that single record. 
   * - For monthly: 
   *    - participation = 1
   *    - beaten = 4 (1+3)
   *    - mastered = 7 (1+3+3)
   * - For shadow: 
   *    - participation = 1
   *    - beaten = 4 (1+3)
   *    - (no "mastered" in shadow, but if forced => 4)
   */
  pointsForAward(award, gameId, year, month) {
    // figure out if gameId is monthly or shadow in that month
    const key = `${year}-${month.padStart(2, '0')}`;
    const cfg = monthConfig[key];
    if (!cfg) {
      // no data => default to monthly logic or 0
      return 0;
    }
    let isMonthly = (cfg.monthlyGame === gameId);
    let isShadow = (cfg.shadowGame === gameId);

    if (award === 'participation') {
      return 1;
    } else if (award === 'beaten') {
      return 4; // 1 + 3
    } else if (award === 'mastered') {
      if (isMonthly) {
        return 7; // 1 + 3 + 3
      } else {
        // shadow can't be 'mastered' normally, but if it is, treat as beaten=4
        return 4;
      }
    }
    return 0;
  }
}

module.exports = AchievementSystem;

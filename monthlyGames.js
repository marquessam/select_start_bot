// monthlyGames.js

/**
 * Each entry:
 *  - month: 'YYYY-MM' string indicating which month/year this game is active
 *  - gameId: RA game ID (string)
 *  - gameName: Display name
 *  - isMonthlyChallenge: true/false (main vs. side game)
 *  - checks: array of strings among ['participation', 'beaten', 'mastery']
 *  - alwaysCheckMastery: whether to keep awarding "mastery" points for this game after its month ends
 */
const monthlyGames = [
  // Example: January 2025 main challenge: Chrono Trigger
  {
    month: '2025-01',
    gameId: '319',
    gameName: 'Chrono Trigger (SNES)',
    isMonthlyChallenge: true,
    checks: ['participation', 'beaten', 'mastery'],
    alwaysCheckMastery: true
  },
  // Example: January 2025 side game: Mario Tennis
  {
    month: '2025-01',
    gameId: '10024',
    gameName: 'Mario Tennis (N64)',
    isMonthlyChallenge: false,
    checks: ['participation', 'beaten'],
    alwaysCheckMastery: false
  },
  // (Feel free to add more months/games as needed)
];

/** 
 * Return "YYYY-MM" for the current system date 
 */
function getCurrentYearMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns the set of games to process *this* month plus any older monthly 
 * challenges that want "mastery" awarding forever (alwaysCheckMastery).
 */
function getActiveGamesForMonth() {
  const currentYM = getCurrentYearMonth();

  return monthlyGames.filter(gameCfg => {
    if (gameCfg.month === currentYM) {
      // It's the current month, so we use all checks
      return true;
    }
    // If it's an older month, but this was a monthly challenge that 
    // wants mastery to keep awarding, we keep it but only for mastery.
    if (gameCfg.isMonthlyChallenge && gameCfg.alwaysCheckMastery) {
      return true;
    }
    // Otherwise, skip
    return false;
  });
}

module.exports = {
  monthlyGames,
  getActiveGamesForMonth,
  getCurrentYearMonth
};

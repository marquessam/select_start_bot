// monthlyGames.js
const monthlyGames = {
    // Key format: YYYY-MM
    "2025-01": {
        monthlyGame: {
            id: "319",
            name: "Chrono Trigger",
            progression: [2080, 2081, 2085, 2090, 2191, 2100, 2108, 2129, 2133],
            winConditions: [2266, 2281],
            requireProgression: true,
            requireAllWinConditions: false,
            allowMastery: true,
            masteryOnly: true  // Special flag for Chrono Trigger
        },
        shadowGame: {
            id: "10024",
            name: "Mario Tennis",
            winConditions: [48411, 48412],
            requireProgression: false,
            requireAllWinConditions: false,
            allowMastery: false
        }
    },
    "2025-02": {
        monthlyGame: {
            id: "355",
            name: "The Legend of Zelda: A Link to the Past",
            progression: [944, 2192, 2282, 980, 2288, 2291, 2292, 2296, 2315, 2336, 2351, 
                         2357, 2359, 2361, 2365, 2334, 2354, 2368, 2350, 2372, 2387],
            winConditions: [2389],
            requireProgression: true,
            requireAllWinConditions: true,
            allowMastery: true
        },
        shadowGame: {
            id: "274",
            name: "U.N. Squadron",
            progression: [6413, 6414, 6415, 6416, 6417, 6418, 6419, 6420, 6421],
            winConditions: [6422],
            requireProgression: true,
            requireAllWinConditions: true,
            allowMastery: false
        }
    }
};

// Points values are consistent across all games
const pointValues = {
    participation: 1,
    beaten: 3,
    mastery: 3
};

module.exports = { monthlyGames, pointValues };

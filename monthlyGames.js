// monthlyGames.js
const monthlyGames = {
    // Key format: YYYY-MM
    "2024-01": {
        monthlyGame: {
            id: "319",
            name: "Chrono Trigger",
            winConditions: [2266, 2281], // Achievement IDs for "beating" the game
            allowMastery: true // Can earn mastery points for this game
        },
        shadowGame: {
            id: "10024",
            name: "Mario Tennis",
            winConditions: [48411, 48412],
            allowMastery: false // Shadow games never give mastery points
        }
    },
    "2024-02": {
        monthlyGame: {
            id: "355",
            name: "The Legend of Zelda: A Link to the Past",
            winConditions: [2389],
            allowMastery: true
        },
        shadowGame: {
            id: "274",
            name: "U.N. Squadron",
            winConditions: [6422],
            allowMastery: false
        }
    }
};

module.exports = monthlyGames;

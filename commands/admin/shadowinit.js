// In shadowinit.js

const database = require('../../database');

module.exports = {
    name: 'shadowinit',
    description: 'Initialize or reinitialize the shadow game',
    permissions: ['ADMINISTRATOR'],
    
    async execute(message, args) {
        try {
            // Create base shadow game data structure
            const shadowGameData = {
                active: true,
                currentProgress: 0,
                triforceState: {
                    wisdom: {
                        required: 6,
                        found: 0,
                        pieces: [
                            "W1X4BY",  // Profile display
                            "W2K5MN",  // Monthly leaderboard
                            "W3R8ST",  // Arcade scores
                            "W4Y6PV",  // Achievement feed
                            "W5J9CH",  // Reviews
                            "W6F7GD"   // Nominations
                        ],
                        collected: []  // Initialize as array for MongoDB
                    },
                    courage: {
                        required: 6,
                        found: 0,
                        pieces: [
                            "C1B5NM",  // Help command
                            "C2K4LP",  // Archive viewer
                            "C3R8TW",  // Rules display
                            "C4Y2XQ",  // Search results
                            "C5V5BN",  // Monthly standings
                            "C6H7JD"   // Points awards
                        ],
                        collected: []  // Initialize as array for MongoDB
                    },
                    power: {
                        collected: false
                    }
                },
                finalReward: {
                    gameId: "274",
                    gameName: "U.N. Squadron",
                    points: {
                        participation: 1,
                        beaten: 3
                    }
                }
            };

            // Save to database
            await database.saveShadowGame(shadowGameData);
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('SHADOW GAME INITIALIZED')
                .setTerminalDescription('[DATABASE UPDATE SUCCESSFUL]')
                .addTerminalField('STATUS', 
                    'Shadow game data structure created\n' +
                    'Triforce pieces reset\n' +
                    'Final reward configured')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Shadow Init Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to initialize shadow game\n[Ready for input]█\x1b[0m```');
        }
    }
};

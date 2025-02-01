const { EmbedBuilder } = require('discord.js');
const database = require('./database');
const { fetchLeaderboardData } = require('./raAPI');

class ShadowGame {
    constructor() {
        this.config = null;
        this.database = require('./database');
        this.checkInterval = null;
    }

    // Helper to validate triforce state
    isValidTriforceState(state) {
        return state && 
               state.wisdom && 
               state.courage && 
               state.power &&
               typeof state.wisdom.found === 'number' &&
               typeof state.courage.found === 'number';
    }

async loadConfig() {
    try {
        this.config = await database.getShadowGame();
        
        // Validate config structure
        if (!this.config || !this.isValidTriforceState(this.config.triforceState)) {
            console.error('Invalid shadow game configuration detected');
            return false;
        }
        
        // Ensure Sets are properly initialized
        if (this.config.triforceState.wisdom.collected && !(this.config.triforceState.wisdom.collected instanceof Set)) {
            if (!Array.isArray(this.config.triforceState.wisdom.collected)) {
                console.error('Wisdom collected is not an array:', this.config.triforceState.wisdom.collected);
                this.config.triforceState.wisdom.collected = [];
            }
            this.config.triforceState.wisdom.collected = new Set(this.config.triforceState.wisdom.collected);
        }
        if (this.config.triforceState.courage.collected && !(this.config.triforceState.courage.collected instanceof Set)) {
            if (!Array.isArray(this.config.triforceState.courage.collected)) {
                console.error('Courage collected is not an array:', this.config.triforceState.courage.collected);
                this.config.triforceState.courage.collected = [];
            }
            this.config.triforceState.courage.collected = new Set(this.config.triforceState.courage.collected);
        }

        return true;
    } catch (error) {
        console.error('Error loading shadow game config:', error);
        return false;
    }
}
    async initialize() {
        try {
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
                        collected: new Set()
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
                        collected: new Set()
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
            
            await database.saveShadowGame(shadowGameData);
            const success = await this.loadConfig();
            
            if (success) {
                console.log('[SHADOW GAME] Initialized successfully');
                return true;
            } else {
                throw new Error('Failed to validate shadow game configuration after initialization');
            }
        } catch (error) {
            console.error('Error initializing shadow game:', error);
            return false;
        }
    }

    async resetProgress() {
        try {
            const shadowGame = await database.getShadowGame() || {};
            
            // Preserve active state and final reward, reset everything else
            shadowGame.currentProgress = 0;
            shadowGame.triforceState = {
                wisdom: {
                    required: 6,
                    found: 0,
                    pieces: [
                        "W1X4BY", "W2K5MN", "W3R8ST",
                        "W4Y6PV", "W5J9CH", "W6F7GD"
                    ],
                    collected: new Set()
                },
                courage: {
                    required: 6,
                    found: 0,
                    pieces: [
                        "C1B5NM", "C2K4LP", "C3R8TW",
                        "C4Y2XQ", "C5V5BN", "C6H7JD"
                    ],
                    collected: new Set()
                },
                power: {
                    collected: false
                }
            };

            await database.saveShadowGame(shadowGame);
            await this.loadConfig();
            console.log('[SHADOW GAME] Progress reset successfully');
            return true;
        } catch (error) {
            console.error('Error resetting shadow game:', error);
            return false;
        }
    }

    async checkMessage(message) {
        try {
            if (!this.config) {
                await this.loadConfig();
            }

            if (!message.content.startsWith('!triforce')) {
                return;
            }

            const args = message.content.split(/\s+/);
            
            if (args.length === 1) {
                await this.showStatus(message);
                return;
            }

            if (args.length === 2 && args[1].toLowerCase() === 'power') {
                await this.checkTriforce(message, 'power');
                return;
            }

            if (args.length === 3) {
                await this.checkTriforce(message, args[1], args[2]);
            }
        } catch (error) {
            console.error('Error in checkMessage:', error);
            await message.channel.send('```ansi\n\x1b[31mAn error occurred while accessing the Sacred Realm...\x1b[0m```');
        }
    }

    async showStatus(message) {
        try {
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('THE SACRED REALM')
                .setDescription(
                    '```ansi\n\x1b[33m' +
                    'The sacred triangles lie scattered across our realm...\n\n' +
                    'Wisdom and Courage, shattered by dark magic, must be restored.\n' +
                    'Their fragments whisper ancient secrets, awaiting those who would seek them.\n\n' +
                    'Only when these pieces are united can the final trial begin.\n\n' +
                    'But beware... Ganon\'s power grows stronger with each passing moment.' +
                    '\x1b[0m```'
                );

            embed.addFields({
                name: 'SACRED REALM STATUS',
                value: this.getTriforceStatus()
            });

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error showing status:', error);
            await message.channel.send('```ansi\n\x1b[31mUnable to view the Sacred Realm...\x1b[0m```');
        }
    }

    async checkTriforce(message, piece, code = null) {
        try {
            if (!this.config?.triforceState) {
                await message.channel.send('```ansi\n\x1b[31mSacred Realm data corrupted...\x1b[0m```');
                return;
            }

            switch(piece.toLowerCase()) {
                case 'wisdom':
                case 'courage':
                    await this.handlePieceCollection(message, piece.toLowerCase(), code);
                    break;
                
                case 'power':
                    await this.handlePowerCollection(message);
                    break;

                default:
                    await message.channel.send('```ansi\n\x1b[31mUnknown power...\x1b[0m```');
            }
        } catch (error) {
            console.error('Error in checkTriforce:', error);
            await message.channel.send('```ansi\n\x1b[31mAn error occurred while channeling ancient power...\x1b[0m```');
        }
    }

    async handlePieceCollection(message, piece, code) {
        const triforce = this.config.triforceState[piece];
        
        if (!triforce || !triforce.pieces) {
            await message.channel.send('```ansi\n\x1b[31mTriforce data corrupted...\x1b[0m```');
            return;
        }

        if (!(triforce.collected instanceof Set)) {
            console.error('triforce.collected is not a Set:', triforce.collected);
            await message.channel.send('```ansi\n\x1b[31mTriforce data corrupted...\x1b[0m```');
            return;
        }

        if (triforce.collected.has(code)) {
            await message.channel.send('```ansi\n\x1b[33mThis ancient power has already been restored to the Sacred Realm...\x1b[0m```');
            return;
        }
        
        if (triforce.pieces.includes(code)) {
            triforce.collected.add(code);
            triforce.found++;
            
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('SACRED POWER RESTORED')
                .setDescription(
                    `A fragment of the Triforce of ${piece} resonates with ancient power!\n\n` +
                    `The Triforce of ${piece} grows stronger...\n` +
                    `${triforce.required - triforce.found} fragments remain lost in shadow.`
                );
            
            await message.channel.send({ embeds: [embed] });
            await this.handleTriforceProgress(message, piece);
            await database.saveShadowGame({
                ...this.config,
                triforceState: {
                    wisdom: {
                        ...this.config.triforceState.wisdom,
                        collected: Array.from(this.config.triforceState.wisdom.collected)
                    },
                    courage: {
                        ...this.config.triforceState.courage,
                        collected: Array.from(this.config.triforceState.courage.collected)
                    },
                    power: this.config.triforceState.power
                }
            });
        } else {
            await message.channel.send('```ansi\n\x1b[31mThis incantation holds no power here...\x1b[0m```');
        }
    }

    async handlePowerCollection(message) {
        const wisdom = this.config.triforceState.wisdom;
        const courage = this.config.triforceState.courage;

        // Check if Wisdom and Courage are complete
        if (wisdom.found !== wisdom.required || courage.found !== courage.required) {
            await message.channel.send('```ansi\n\x1b[31mThe Triforce remains incomplete. Wisdom and Courage must first be restored...\x1b[0m```');
            return;
        }

        // Check if ALTTP has been beaten
        const leaderboard = await global.leaderboardCache?.getMonthlyLeaderboard();
        const anyoneBeatenGame = leaderboard?.some(user => user.hasBeatenGame);
        
        if (!anyoneBeatenGame) {
            await message.channel.send('```ansi\n\x1b[31mGanon\'s dark magic still protects the Triforce of Power...\nNone have yet proven strong enough to break his seal.\x1b[0m```');
            return;
        }

        // All conditions met, grant power
        this.config.triforceState.power.collected = true;
        await database.saveShadowGame(this.config);
        await this.revealShadowChallenge(message);

        // Start achievement checking if not already running
        if (!this.checkInterval) {
            this.checkInterval = setInterval(() => this.checkAchievements(), 5 * 60 * 1000);
        }
    }

    async handleTriforceProgress(message, piece) {
        const triforce = this.config.triforceState[piece];
        
        if (triforce.found === triforce.required) {
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`THE TRIFORCE OF ${piece.toUpperCase()} AWAKENS`)
                .setDescription(
                    `The Triforce of ${piece} pulses with renewed power!\n` +
                    `Its ancient strength has been restored!`
                );
                
            await message.channel.send({ embeds: [embed] });
            
            const wisdom = this.config.triforceState.wisdom;
            const courage = this.config.triforceState.courage;
            
            if (wisdom.found === wisdom.required && courage.found === courage.required) {
                await message.channel.send('```ansi\n' +
                    '\x1b[33mWisdom and Courage shine with sacred light!\n\n' +
                    'But darkness still grips the Triforce of Power...\n' +
                    'Only by defeating Ganon can the final piece be claimed.\n\n' +
                    'Face your destiny, hero...\x1b[0m```');
            }
        }
    }

    getTriforceStatus() {
        if (!this.config?.triforceState) {
            return 'ERROR: Sacred Realm data corrupted';
        }

        const wisdom = this.config.triforceState.wisdom || { found: 0, required: 6 };
        const courage = this.config.triforceState.courage || { found: 0, required: 6 };
        const power = this.config.triforceState.power || { collected: false };
        
        return `Triforce of Wisdom: ${wisdom.found || 0}/${wisdom.required} fragments restored\n` +
               `Triforce of Courage: ${courage.found || 0}/${courage.required} fragments restored\n` +
               `Triforce of Power: ${power.collected ? 'Reclaimed from darkness' : 'Held by Ganon'}`;
    }

    async revealShadowChallenge(message) {
        try {
            if (!this.config?.finalReward) {
                throw new Error('No final reward configured');
            }

            const reward = this.config.finalReward;
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('THE TRIFORCE UNITED')
                .setDescription(
                    '```ansi\n' +
                    '\x1b[33mAs the three golden triangles resonate as one, ' +
                    'a new trial emerges from the shadows...\n\n' +
                    `${reward.gameName}\n\n` +
                    'This challenge may be undertaken alongside your current quest.\n' +
                    'Rewards for the worthy:\n' +
                    `Mark of Participation: ${reward.points.participation} sacred point\n` +
                    `Mark of Completion: ${reward.points.beaten} sacred points` +
                    '\x1b[0m```'
                )
                .setURL(`https://retroachievements.org/game/${reward.gameId}`)
                .setFooter({ text: `SACRED_SEAL: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error in revealShadowChallenge:', error);
            await message.channel.send('```ansi\n\x1b[31mA dark power prevents the revelation...\x1b[0m```');
        }
    }

    async checkAchievements(userStats) {
        if (!this.config?.triforceState?.power?.collected || !this.config?.finalReward?.gameId) {
            return;
        }

        try {
            const data = await fetchLeaderboardData();
            if (!data?.leaderboard) return;

            await Promise.all(data.leaderboard.map(async (user) => {
                if (!user?.username) return;
                
                const username = user.username.toLowerCase();
                 if (user.completedAchievements > 0) {
                    const participationKey = `shadow-participation-${this.config.finalReward.gameId}`;
                    try {
                        const hasPoints = await database.hasUserBonusPoints(username, participationKey);
                        if (!hasPoints && userStats) {
                            await userStats.addBonusPoints(
                                username,
                                this.config.finalReward.points.participation,
                                `${this.config.finalReward.gameName} - Shadow Challenge Begun`
                            );
                            console.log(`[SHADOW GAME] Awarded participation points to ${username}`);
                        }
                    } catch (error) {
                        console.error(`[SHADOW GAME] Error checking/awarding participation points for ${username}:`, error);
                    }
                }

                // Check for completion
                if (user.hasBeatenGame) {
                    const beatenKey = `shadow-beaten-${this.config.finalReward.gameId}`;
                    try {
                        const hasPoints = await database.hasUserBonusPoints(username, beatenKey);
                        if (!hasPoints && userStats) {
                            await userStats.addBonusPoints(
                                username,
                                this.config.finalReward.points.beaten,
                                `${this.config.finalReward.gameName} - Shadow Challenge Mastered`
                            );
                            console.log(`[SHADOW GAME] Awarded completion points to ${username}`);
                        }
                    } catch (error) {
                        console.error(`[SHADOW GAME] Error checking/awarding completion points for ${username}:`, error);
                    }
                }
            }));

        } catch (error) {
            console.error('[SHADOW GAME] Error checking achievements:', error);
        }
    }

    // Method to clean up resources
    cleanup() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    // Method to validate configuration
    validateConfig() {
        if (!this.config) return false;
        
        const required = ['active', 'triforceState', 'finalReward'];
        for (const field of required) {
            if (!(field in this.config)) {
                console.error(`[SHADOW GAME] Missing required field: ${field}`);
                return false;
            }
        }

        const triforce = this.config.triforceState;
        if (!triforce.wisdom || !triforce.courage || !triforce.power) {
            console.error('[SHADOW GAME] Missing triforce pieces in state');
            return false;
        }

        const reward = this.config.finalReward;
        if (!reward.gameId || !reward.gameName || !reward.points) {
            console.error('[SHADOW GAME] Invalid final reward configuration');
            return false;
        }

        return true;
    }
}

module.exports = ShadowGame;

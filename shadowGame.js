const { EmbedBuilder } = require('discord.js');
const database = require('./database');
const { fetchLeaderboardData } = require('./raAPI');

class ShadowGame {
    constructor() {
        this.config = null;
        this.checkInterval = null;
    }

    // Initialization method
    async initialize() {
        console.log('[SHADOW GAME] Initializing...');
        try {
            this.config = await database.getShadowGame();

            if (!this.config || !this.isValidTriforceState(this.config.triforceState)) {
                console.log('[SHADOW GAME] Invalid or missing config, resetting...');
                await this.resetProgress();
            }

            console.log('[SHADOW GAME] Initialized successfully.');
        } catch (error) {
            console.error('[SHADOW GAME] Initialization error:', error);
        }
    }

    // Resets the game state
    async resetProgress() {
        this.config = {
            active: true,
            currentProgress: 0,
            triforceState: {
                wisdom: {
                    required: 6,
                    found: 0,
                    pieces: ["W1X4BY", "W2K5MN", "W3R8ST", "W4Y6PV", "W5J9CH", "W6F7GD"],
                    collected: []
                },
                courage: {
                    required: 6,
                    found: 0,
                    pieces: ["C1B5NM", "C2K4LP", "C3R8TW", "C4Y2XQ", "C5V5BN", "C6H7JD"],
                    collected: []
                },
                power: {
                    collected: false
                }
            },
            finalReward: {
                gameId: "274",
                gameName: "U.N. Squadron",
                points: { participation: 1, beaten: 3 }
            }
        };

        await database.saveShadowGame(this.config);
        console.log('[SHADOW GAME] Game progress reset.');
    }

    // Validates the Triforce state structure
    isValidTriforceState(state) {
        return state &&
               state.wisdom && Array.isArray(state.wisdom.collected) &&
               state.courage && Array.isArray(state.courage.collected) &&
               typeof state.wisdom.found === 'number' &&
               typeof state.courage.found === 'number';
    }

    // Handles the !triforce command
    async checkMessage(message) {
        try {
            if (!this.config) await this.initialize();

            if (!message.content.startsWith('!triforce')) return;

            const args = message.content.split(/\s+/);

            if (args.length === 1) {
                return await this.showStatus(message);
            } 
            
            if (args[1].toLowerCase() === 'power') {
                return await this.handlePowerCollection(message);
            }

            if (args.length === 3) {
                return await this.handlePieceCollection(message, args[1], args[2]);
            }
        } catch (error) {
            console.error('[SHADOW GAME] Error handling command:', error);
            await message.channel.send('```ansi\n\x1b[31mAn error occurred while accessing the Sacred Realm...\x1b[0m```');
        }
    }

    // Shows the current status of the Triforce
    async showStatus(message) {
        const { wisdom, courage, power } = this.config.triforceState;
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('THE SACRED REALM')
            .setDescription(`Wisdom: ${wisdom.found}/${wisdom.required}\nCourage: ${courage.found}/${courage.required}\nPower: ${power.collected ? 'Reclaimed' : 'Sealed'}`);
        
        await message.channel.send({ embeds: [embed] });
    }

    // Handles collection of wisdom/courage pieces
    async handlePieceCollection(message, piece, code) {
        const triforce = this.config.triforceState[piece.toLowerCase()];

        if (!triforce || !triforce.pieces.includes(code)) {
            return await message.channel.send('```ansi\n\x1b[31mThis incantation holds no power here...\x1b[0m```');
        }

        if (triforce.collected.includes(code)) {
            return await message.channel.send('```ansi\n\x1b[33mThis ancient power has already been restored...\x1b[0m```');
        }

        triforce.collected.push(code);
        triforce.found++;
        await database.saveShadowGame(this.config);

        await message.channel.send(`A fragment of ${piece} was restored! ${triforce.required - triforce.found} remain.`);
        
        if (triforce.found === triforce.required) {
            await this.handleTriforceCompletion(message, piece);
        }
    }

    // Handles the completion of Wisdom or Courage
    async handleTriforceCompletion(message, piece) {
        await message.channel.send(`The Triforce of ${piece.toUpperCase()} has been fully restored!`);
        const { wisdom, courage } = this.config.triforceState;

        if (wisdom.found === wisdom.required && courage.found === courage.required) {
            await message.channel.send('Both Wisdom and Courage are restored! Now, claim the Triforce of Power!');
        }
    }

    // Handles collection of the Triforce of Power
    async handlePowerCollection(message) {
        const { wisdom, courage } = this.config.triforceState;

        if (wisdom.found < 6 || courage.found < 6) {
            return await message.channel.send('```ansi\n\x1b[31mThe Triforce remains incomplete...\x1b[0m```');
        }

        this.config.triforceState.power.collected = true;
        await database.saveShadowGame(this.config);
        await this.revealShadowChallenge(message);
    }

    // Reveals the final challenge
    async revealShadowChallenge(message) {
        const { gameName, gameId } = this.config.finalReward;
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('THE TRIFORCE UNITED')
            .setDescription(`The final trial emerges...\n**${gameName}**\n[Play Now!](https://retroachievements.org/game/${gameId})`);

        await message.channel.send({ embeds: [embed] });
    }
}

module.exports = ShadowGame;

const { EmbedBuilder } = require('discord.js');
const database = require('./database');

class ShadowGame {
    constructor() {
        this.config = null;
        this.isInitializing = false;
        this._initPromise = null;
    }

    async initialize() {
        if (this.isInitializing) {
            console.log('[SHADOW GAME] Already initializing, returning existing promise...');
            return this._initPromise;
        }

        this.isInitializing = true;
        console.log('[SHADOW GAME] Initializing...');

        this._initPromise = (async () => {
            try {
                this.config = await database.getShadowGame();

                if (!this.config || !this.isValidTriforceState(this.config.triforceState)) {
                    console.log('[SHADOW GAME] Invalid or missing data, resetting progress...');
                    await this.resetProgress();
                }

                console.log('[SHADOW GAME] Initialization complete');
                return true;
            } catch (error) {
                console.error('[SHADOW GAME] Initialization error:', error);
                return false;
            } finally {
                this.isInitializing = false;
            }
        })();

        return this._initPromise;
    }

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
                power: { collected: false }
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

        await database.saveShadowGame(this.config);
        console.log('[SHADOW GAME] Progress reset complete');
    }

    async checkMessage(message) {
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
    }

    async showStatus(message) {
        const status = await this.getStatusDisplay();
        
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(status.title)
            .setDescription(status.description);

        if (status.gameId) {
            embed.setURL(`https://retroachievements.org/game/${status.gameId}`);
        }

        if (status.prophecy) {
            embed.addFields({
                name: 'ANCIENT PROPHECY',
                value: status.prophecy
            });
        }

        await message.channel.send({ embeds: [embed] });
    }

    async getStatusDisplay() {
        if (!this.config || !this.config.active) {
            return {
                title: 'THE SACRED REALM',
                description: '```ansi\n\x1b[33m' +
                    'An ancient power stirs in the shadows...\n' +
                    'But its presence remains hidden.\n' +
                    '\x1b[0m```'
            };
        }

        const { wisdom, courage, power } = this.config.triforceState;
        
        if (power.collected) {
            return {
                title: 'SHADOW CHALLENGE UNLOCKED',
                description: '```ansi\n\x1b[33m' +
                    `A new trial emerges from the darkness...\n\n` +
                    `GAME: ${this.config.finalReward.gameName}\n\n` +
                    `REWARDS:\n` +
                    `Mark of Participation: ${this.config.finalReward.points.participation} sacred point\n` +
                    `Mark of Completion: ${this.config.finalReward.points.beaten} sacred points\n\n` +
                    'This challenge runs parallel to your current quest.\n' +
                    '\x1b[0m```',
                gameId: this.config.finalReward.gameId
            };
        }

        const status = {
            title: 'THE SACRED REALM',
            description: '```ansi\n\x1b[33m' +
                'The sacred triangles lie scattered across our realm...\n\n' +
                `TRIFORCE OF WISDOM\n` +
                `${wisdom.found}/${wisdom.required} fragments restored\n\n` +
                `TRIFORCE OF COURAGE\n` +
                `${courage.found}/${courage.required} fragments restored\n\n` +
                `TRIFORCE OF POWER\n` +
                `Status: ${power.collected ? 'Reclaimed from darkness' : 'Still held by Ganon...'}\n` +
                '\x1b[0m```'
        };

        if (wisdom.found === wisdom.required && courage.found === courage.required && !power.collected) {
            status.prophecy = '```ansi\n\x1b[33m' +
                'Wisdom and Courage shine with sacred light!\n' +
                'But darkness still grips the Triforce of Power...\n' +
                'Only by defeating Ganon can the final piece be claimed.\n\n' +
                'Face your destiny, hero...\n' +
                '\x1b[0m```';
        }

        return status;
    }

    async handlePieceCollection(message, piece, code) {
        if (!['wisdom', 'courage'].includes(piece.toLowerCase())) {
            await message.channel.send('```ansi\n\x1b[31mUnknown power...\x1b[0m```');
            return;
        }

        const triforce = this.config.triforceState[piece.toLowerCase()];
        
        if (!triforce.pieces.includes(code)) {
            await message.channel.send('```ansi\n\x1b[31mThis incantation holds no power here...\x1b[0m```');
            return;
        }

        if (triforce.collected.includes(code)) {
            await message.channel.send('```ansi\n\x1b[33mThis ancient power has already been restored to the Sacred Realm...\x1b[0m```');
            return;
        }

        triforce.collected.push(code);
        triforce.found++;
        await database.saveShadowGame(this.config);

        const remaining = triforce.required - triforce.found;
        await message.channel.send(
            '```ansi\n\x1b[33m' +
            `A fragment of the Triforce of ${piece} resonates!\n` +
            `${remaining} fragments remain lost...\n` +
            '\x1b[0m```'
        );

        if (triforce.found === triforce.required) {
            await this.handleTriforceProgress(message, piece);
        }
    }

    async handleTriforceProgress(message, piece) {
        await message.channel.send(
            '```ansi\n\x1b[33m' +
            `The Triforce of ${piece.toUpperCase()} has been fully restored!\n` +
            '\x1b[0m```'
        );

        if (this.config.triforceState.wisdom.found === this.config.triforceState.wisdom.required && 
            this.config.triforceState.courage.found === this.config.triforceState.courage.required) {
            await message.channel.send(
                '```ansi\n\x1b[33m' +
                'Wisdom and Courage shine with sacred light!\n\n' +
                'Only the final trial remains...\n' +
                '\x1b[0m```'
            );
        }
    }

    async handlePowerCollection(message) {
        if (this.config.triforceState.wisdom.found < this.config.triforceState.wisdom.required || 
            this.config.triforceState.courage.found < this.config.triforceState.courage.required) {
            await message.channel.send(
                '```ansi\n\x1b[31m' +
                'Ganon\'s dark magic still protects the Triforce of Power...\n' +
                'None have yet proven strong enough to break his seal.\n' +
                '\x1b[0m```'
            );
            return;
        }

        this.config.triforceState.power.collected = true;
        await database.saveShadowGame(this.config);
        await this.revealShadowChallenge(message);
    }

    async revealShadowChallenge(message) {
        const { gameName, gameId } = this.config.finalReward;

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('THE TRIFORCE UNITED')
            .setDescription(
                '```ansi\n' +
                '\x1b[33mAs the three golden triangles resonate as one, ' +
                'a new trial emerges from the shadows...\n\n' +
                `${gameName}\n\n` +
                'This challenge may be undertaken alongside your current quest.\n' +
                'Rewards for the worthy:\n' +
                'Mark of Participation: 1 sacred point\n' +
                'Mark of Completion: 3 sacred points' +
                '\x1b[0m```'
            )
            .setURL(`https://retroachievements.org/game/${gameId}`);

        await message.channel.send({ embeds: [embed] });
    }

    isActive() {
        return this.config?.active && this.config?.triforceState?.power?.collected;
    }

    isValidTriforceState(state) {
        return state &&
               state.wisdom && 
               Array.isArray(state.wisdom.collected) &&
               state.courage && 
               Array.isArray(state.courage.collected) &&
               state.power &&
               typeof state.power.collected === 'boolean';
    }

    async tryShowError(message) {
        // Optional error hints for debugging
        if (this.config?.triforceState?.wisdom?.found === 5 &&
            this.config?.triforceState?.courage?.found === 5) {
            await message.channel.send(
                '```ansi\n\x1b[31m' +
                '[ERROR 0x3F7]: Ancient data corruption detected...\n' +
                'Sacred text fragments remain hidden in the system.\n' +
                '\x1b[0m```'
            );
        }
    }
}

module.exports = ShadowGame;

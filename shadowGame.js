const { EmbedBuilder } = require('discord.js');
const database = require('./database');
const { fetchLeaderboardData } = require('./raAPI');

class ShadowGame {
    constructor() {
        this.config = null;
    }

    async initialize() {
        console.log('[SHADOW GAME] Initializing...');
        try {
            this.config = await database.getShadowGame();

            if (!this.config || !this.isValidTriforceState(this.config.triforceState)) {
                console.log('[SHADOW GAME] Invalid data detected, resetting progress.');
                await this.resetProgress();
            }

            console.log('[SHADOW GAME] Ready!');
        } catch (error) {
            console.error('[SHADOW GAME] Initialization error:', error);
        }
    }

    async resetProgress() {
        this.config = {
            active: true,
            currentProgress: 0,
            triforceState: {
                wisdom: { required: 6, found: 0, pieces: ["W1X4BY", "W2K5MN", "W3R8ST", "W4Y6PV", "W5J9CH", "W6F7GD"], collected: [] },
                courage: { required: 6, found: 0, pieces: ["C1B5NM", "C2K4LP", "C3R8TW", "C4Y2XQ", "C5V5BN", "C6H7JD"], collected: [] },
                power: { collected: false }
            },
            finalReward: { gameId: "274", gameName: "U.N. Squadron", points: { participation: 1, beaten: 3 } }
        };

        await database.saveShadowGame(this.config);
        console.log('[SHADOW GAME] Progress reset.');
    }

    async checkMessage(message) {
        if (!this.config) await this.initialize();

        if (!message.content.startsWith('!triforce')) return;

        const args = message.content.split(/\s+/);
        if (args.length === 1) return await this.showStatus(message);
        if (args[1].toLowerCase() === 'power') return await this.handlePowerCollection(message);
        if (args.length === 3) return await this.handlePieceCollection(message, args[1], args[2]);
    }

    async showStatus(message) {
        const { wisdom, courage, power } = this.config.triforceState;

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
            )
            .addFields({
                name: 'SACRED REALM STATUS',
                value: `Triforce of Wisdom: ${wisdom.found}/6 fragments restored\n` +
                       `Triforce of Courage: ${courage.found}/6 fragments restored\n` +
                       `Triforce of Power: ${power.collected ? 'Reclaimed' : 'Held by Ganon'}`
            });

        await message.channel.send({ embeds: [embed] });
    }

    async handlePieceCollection(message, piece, code) {
        if (!['wisdom', 'courage'].includes(piece)) {
            return await message.channel.send('```ansi\n\x1b[31mUnknown power...\x1b[0m```');
        }

        const triforce = this.config.triforceState[piece];
        if (!triforce.pieces.includes(code)) {
            return await message.channel.send('```ansi\n\x1b[31mThis incantation holds no power here...\x1b[0m```');
        }

        if (triforce.collected.includes(code)) {
            return await message.channel.send('```ansi\n\x1b[33mThis ancient power has already been restored to the Sacred Realm...\x1b[0m```');
        }

        triforce.collected.push(code);
        triforce.found++;
        await database.saveShadowGame(this.config);

        const remaining = triforce.required - triforce.found;
        await message.channel.send(`A fragment of the Triforce of ${piece} resonates! ${remaining} fragments remain lost.`);

        if (triforce.found === triforce.required) {
            await this.handleTriforceProgress(message, piece);
        }
    }

    async handleTriforceProgress(message, piece) {
        await message.channel.send(`The Triforce of ${piece.toUpperCase()} has been fully restored!`);

        if (this.config.triforceState.wisdom.found === 6 && this.config.triforceState.courage.found === 6) {
            await message.channel.send('```ansi\n\x1b[33mWisdom and Courage shine with sacred light!\n\nOnly the final trial remains...\x1b[0m```');
        }
    }

    async handlePowerCollection(message) {
        if (this.config.triforceState.wisdom.found < 6 || this.config.triforceState.courage.found < 6) {
            return await message.channel.send('```ansi\n\x1b[31mThe Triforce of Power remains in Ganon\'s grasp, protected by his dark magic...\x1b[0m```');
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

    isValidTriforceState(state) {
        return state &&
               state.wisdom && Array.isArray(state.wisdom.collected) &&
               state.courage && Array.isArray(state.courage.collected);
    }
}

module.exports = ShadowGame;

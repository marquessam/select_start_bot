const { EmbedBuilder } = require('discord.js');
const database = require('./database');
const { fetchLeaderboardData } = require('./raAPI');

class ShadowGame {
    constructor(client) {
        this.client = client;
        this.channelId = process.env.SHADOW_GAME_CHANNEL;
        this.config = null;
    }

    async initialize() {
        console.log('[SHADOW GAME] Initializing...');
        try {
            this.config = await database.getShadowGame();

            if (!this.config || !this.isValidTriforceState(this.config.triforceState)) {
                console.log('[SHADOW GAME] Invalid data detected, resetting game progress.');
                await this.resetProgress();
            }

            console.log('[SHADOW GAME] Ready!');
        } catch (error) {
            console.error('[SHADOW GAME] Initialization error:', error);
        }
    }

    // ✅ Resets ShadowGame progress
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
        console.log('[SHADOW GAME] Progress reset successfully.');
    }

    // ✅ Handles !triforce command
    async checkMessage(message) {
        const args = message.content.split(/\s+/);
        if (args.length === 1) return await this.showStatus(message);
        if (args.length === 2 && args[1].toLowerCase() === 'power') return await this.handlePowerCollection(message);
        if (args.length === 3) return await this.handlePieceCollection(message, args[1], args[2]);
    }

    // ✅ Displays current Triforce status
    async showStatus(message) {
        const status = this.getTriforceStatus();
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('THE SACRED REALM')
            .setDescription(status);

        await message.channel.send({ embeds: [embed] });
    }

    // ✅ Handles Wisdom/Courage collection
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

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`SACRED POWER RESTORED`)
            .setDescription(`A fragment of the Triforce of ${piece} has been restored! ${triforce.required - triforce.found} fragments remain lost.`);

        await message.channel.send({ embeds: [embed] });

        if (triforce.found === triforce.required) {
            await this.handleTriforceProgress(message, piece);
        }
    }

    // ✅ Checks if Wisdom & Courage are complete before Power unlock
    async handlePowerCollection(message) {
        if (this.config.triforceState.wisdom.found < 6 || this.config.triforceState.courage.found < 6) {
            return await message.channel.send('```ansi\n\x1b[31mThe Triforce remains incomplete...\x1b[0m```');
        }

        this.config.triforceState.power.collected = true;
        await database.saveShadowGame(this.config);
        await this.revealShadowChallenge(message);
    }

    // ✅ Unlocks the ShadowGame challenge
    async revealShadowChallenge(message) {
        const reward = this.config.finalReward;
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('THE TRIFORCE UNITED')
            .setDescription(
                `As the Triforce is restored, a new trial emerges...\n\n**${reward.gameName}**\n\n` +
                `**Rewards:**\nParticipation: ${reward.points.participation} points\nCompletion: ${reward.points.beaten} points`
            )
            .setURL(`https://retroachievements.org/game/${reward.gameId}`);

        await message.channel.send({ embeds: [embed] });
    }

    // ✅ Handles Triforce completion messages
    async handleTriforceProgress(message, piece) {
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle(`THE TRIFORCE OF ${piece.toUpperCase()} AWAKENS`)
            .setDescription(`The Triforce of ${piece} has been fully restored!`);

        await message.channel.send({ embeds: [embed] });

        if (this.config.triforceState.wisdom.found === 6 && this.config.triforceState.courage.found === 6) {
            await message.channel.send('```ansi\n\x1b[33mWisdom and Courage shine with sacred light!\n\nOnly the final trial remains...\x1b[0m```');
        }
    }

    // ✅ Checks if Triforce state is valid
    isValidTriforceState(state) {
        return state && state.wisdom && state.courage && state.power &&
            Array.isArray(state.wisdom.collected) &&
            Array.isArray(state.courage.collected);
    }

    // ✅ Returns current Triforce status
    getTriforceStatus() {
        const { wisdom, courage, power } = this.config.triforceState;
        return `**Wisdom:** ${wisdom.found}/6 pieces restored\n` +
               `**Courage:** ${courage.found}/6 pieces restored\n` +
               `**Power:** ${power.collected ? 'Claimed' : 'Awaiting Hero'}`;
    }
}

module.exports = ShadowGame;

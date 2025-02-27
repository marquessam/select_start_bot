const { EmbedBuilder } = require('discord.js');
const database = require('./database');

class ShadowGame {
    constructor() {
        this.config = null;
        this.isInitializing = false;
        this._initPromise = null;
        this.services = null;
    }

    setServices(services) {
        this.services = services;
        console.log('[SHADOW GAME] Services linked:', Object.keys(services));
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

                if (!this.config || !this.isValidConfig(this.config)) {
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
            active: false,
            revealed: false,
            expectedGameName: "Monster Rancher Advance 2",
            finalReward: {
                gameId: "7181",
                gameName: "Monster Rancher Advance 2",
                platform: "GBA",
                points: {
                    participation: 1,
                    beaten: 3
                }
            }
        };

        await database.saveShadowGame(this.config);
        console.log('[SHADOW GAME] Progress reset.');
    }

    async checkMessage(message) {
        if (!this.config) await this.initialize();
        if (!message.content.startsWith('!shadowgame')) return;

        const args = message.content.split(/\s+/);
        
        if (args.length === 1) {
            return await this.showStatus(message);
        }
        
        // Check if the user is trying to guess the shadow game
        const guess = args.slice(1).join(' ');
        return await this.handleGameGuess(message, guess);
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

        await message.channel.send({ embeds: [embed] });
    }

    async getStatusDisplay() {
        if (!this.config) {
            return {
                title: 'SHADOW CHALLENGE',
                description: '```ansi\n\x1b[33m' +
                    'An ancient power stirs in the shadows...\n' +
                    'But its presence remains hidden.\n' +
                    '\x1b[0m```'
            };
        }

        if (!this.config.revealed) {
            return {
                title: 'SHADOW CHALLENGE',
                description: '```ansi\n\x1b[33m' +
                    'The shadow game is hidden...\n' +
                    'Please input the name of the shadow game to activate it.\n' +
                    '\x1b[0m```'
            };
        }

        // Shadow game is revealed
        return {
            title: 'SHADOW CHALLENGE UNLOCKED',
            description: '```ansi\n\x1b[33m' +
                `A new trial emerges from the darkness...\n\n` +
                `GAME: ${this.config.finalReward.gameName}\n\n` +
                `REWARDS:\n` +
                `Participation: ${this.config.finalReward.points.participation} sacred point\n` +
                `Beaten: ${this.config.finalReward.points.beaten} sacred points\n\n` +
                'This challenge runs parallel to your current quest.\n' +
                '\x1b[0m```',
            gameId: this.config.finalReward.gameId
        };
    }

    async handleGameGuess(message, guess) {
        if (this.config.revealed) {
            await message.channel.send('```ansi\n\x1b[33mThe shadow game has already been revealed!\x1b[0m```');
            return;
        }

        if (guess.toLowerCase() === this.config.expectedGameName.toLowerCase()) {
            this.config.revealed = true;
            this.config.active = true;
            await database.saveShadowGame(this.config);
            await this.revealShadowChallenge(message);
        } else {
            await message.channel.send('```ansi\n\x1b[31mThat is not the correct shadow game...\x1b[0m```');
        }
    }

    async revealShadowChallenge(message) {
        const { gameName, gameId, platform } = this.config.finalReward;

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('SHADOW CHALLENGE REVEALED')
            .setDescription(
                '```ansi\n' +
                '\x1b[33mThe shadows part to reveal a new challenge...\n\n' +
                `${gameName} (${platform})\n\n` +
                'This challenge may be undertaken alongside your current quest.\n' +
                'Rewards:\n' +
                'Participation: 1 point\n' +
                'Beaten: 3  points' +
                '\x1b[0m```'
            )
            .setURL(`https://retroachievements.org/game/${gameId}`);

        await message.channel.send({ embeds: [embed] });
    }

    isActive() {
        return this.config?.active && this.config?.revealed;
    }

    isValidConfig(config) {
        return config &&
               typeof config.active === 'boolean' &&
               typeof config.revealed === 'boolean' &&
               config.expectedGameName &&
               config.finalReward;
    }
}

module.exports = ShadowGame;

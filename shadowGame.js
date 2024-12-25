const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class ShadowGame {
    constructor() {
        this.configPath = path.join(__dirname, 'shadowGame.json');
        this.config = null;
        this.errorChance = 0.95; // 95% chance to show error after commands
    }

    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
            console.log('Shadow Game config loaded successfully');
            return true;
        } catch (error) {
            console.error('Error loading shadow game config:', error);
            return false;
        }
    }

    async tryShowError(message) {
        try {
            // Check if config is loaded
            if (!this.config) {
                console.log('No config loaded, attempting to load...');
                await this.loadConfig();
            }

            // Verify configuration
            if (!this.config || !this.config.currentShadowGame || !this.config.currentShadowGame.active) {
                console.log('Invalid config state:', this.config);
                return;
            }

            // Random chance check
            if (Math.random() > this.errorChance) {
                console.log('Random check failed');
                return;
            }

            const currentPuzzle = this.config.currentShadowGame.puzzles[this.config.currentProgress];
            if (!currentPuzzle) {
                console.log('No puzzle found for current progress:', this.config.currentProgress);
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('SYSTEM ERROR')
                .setDescription('```ansi\n\x1b[31m' + currentPuzzle.error + '\x1b[0m```')
                .setFooter({ text: `ERROR_ID: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error in tryShowError:', error);
        }
    }

    async checkMessage(message) {
        try {
            // Check if config is loaded
            if (!this.config) {
                await this.loadConfig();
            }

            if (!this.config || !this.config.currentShadowGame || !this.config.currentShadowGame.active) {
                return;
            }

            if (!message.content.startsWith('!')) {
                return;
            }

            const currentPuzzle = this.config.currentShadowGame.puzzles[this.config.currentProgress];
            if (!currentPuzzle) {
                return;
            }

            if (message.content.toLowerCase() === currentPuzzle.solution.toLowerCase()) {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('ERROR RESOLVED')
                    .setDescription('```ansi\n\x1b[32m' + currentPuzzle.completion_message + '\x1b[0m```')
                    .setFooter({ text: `REPAIR_ID: ${Date.now().toString(36).toUpperCase()}` });

                await message.channel.send({ embeds: [embed] });

                if (this.config.currentProgress < this.config.currentShadowGame.puzzles.length - 1) {
                    this.config.currentProgress++;
                    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
                } else {
                    await this.revealShadowChallenge(message);
                }
            }
        } catch (error) {
            console.error('Error in checkMessage:', error);
        }
    }

    async revealShadowChallenge(message) {
        try {
            const reward = this.config.currentShadowGame.finalReward;
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('SYSTEM RESTORED')
                .setDescription('```ansi\n\x1b[32m[HIDDEN DATA RECOVERED]\n\nSystem repairs have revealed classified data:\n\n' + reward.gameName + '\n\nThis challenge may be completed alongside the monthly mission.\nCompletion will award ' + reward.points + ' yearly points.\x1b[0m```')
                .setURL(`https://retroachievements.org/game/${reward.gameId}`)
                .setFooter({ text: `CLEARANCE_ID: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error in revealShadowChallenge:', error);
        }
    }
}

module.exports = ShadowGame;

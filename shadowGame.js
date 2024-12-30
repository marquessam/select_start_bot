const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class ShadowGame {
    constructor() {
        this.configPath = path.join(__dirname, 'shadowGame.json');
        this.config = null;
        this.errorChance = 0.35; // 35% chance to show error after commands
    }

    async resetProgress() {
    this.config.currentShadowGame.currentProgress = 0;
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    return true;
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
            console.log('tryShowError called');
            
            if (!this.config || !this.config.currentShadowGame) {
                console.log('No valid config found');
                return;
            }

            // Initialize progress if undefined
            if (typeof this.config.currentShadowGame.currentProgress === 'undefined') {
                this.config.currentShadowGame.currentProgress = 0;
            }

            console.log('Current progress:', this.config.currentShadowGame.currentProgress);

            const currentPuzzle = this.config.currentShadowGame.puzzles[this.config.currentShadowGame.currentProgress];
            if (!currentPuzzle) {
                console.log('No puzzle found or all puzzles complete');
                return;
            }

            // Random chance check
            const roll = Math.random();
            if (roll > this.errorChance) {
                console.log('Random check failed');
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
            console.log('Checking message:', message.content);

            // Make sure config is loaded
            if (!this.config) {
                await this.loadConfig();
            }

            // Reset command
            if (message.content === '!shadowreset') {
                console.log('Reset command received');
                // Reset progress
                this.config.currentShadowGame.currentProgress = 0;
                await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
                console.log('Progress reset to 0');
                
                // Send confirmation
                await message.channel.send('```ansi\n\x1b[32m[SYSTEM RESET COMPLETE]\n[Ready for input]█\x1b[0m```');
                
                // Show first error again
                const firstPuzzle = this.config.currentShadowGame.puzzles[0];
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('SYSTEM ERROR')
                    .setDescription('```ansi\n\x1b[31m' + firstPuzzle.error + '\x1b[0m```')
                    .setFooter({ text: `ERROR_ID: ${Date.now().toString(36).toUpperCase()}` });

                await message.channel.send({ embeds: [errorEmbed] });
                return;
            }

            // Safety checks with logging
            if (!this.config || !this.config.currentShadowGame) {
                console.log('No valid config found');
                return;
            }

            // Initialize progress if undefined
            if (typeof this.config.currentShadowGame.currentProgress === 'undefined') {
                console.log('Initializing progress to 0');
                this.config.currentShadowGame.currentProgress = 0;
            }

            console.log('Current progress:', this.config.currentShadowGame.currentProgress);
            const currentPuzzle = this.config.currentShadowGame.puzzles[this.config.currentShadowGame.currentProgress];
            
            if (!currentPuzzle) {
                console.log('No puzzle found for current progress');
                return;
            }

            console.log('Comparing:', message.content.toLowerCase(), 'with:', currentPuzzle.solution.toLowerCase());
            
            if (message.content.toLowerCase() === currentPuzzle.solution.toLowerCase()) {
                console.log('Solution matched!');
                
                // Send success message
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('ERROR RESOLVED')
                    .setDescription('```ansi\n\x1b[32m' + currentPuzzle.completion_message + '\x1b[0m```')
                    .setFooter({ text: `REPAIR_ID: ${Date.now().toString(36).toUpperCase()}` });
                
                await message.channel.send({ embeds: [embed] });
                
                // Update progress
                this.config.currentShadowGame.currentProgress++;
                console.log('New progress:', this.config.currentShadowGame.currentProgress);
                
                // Save to file
                await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
                console.log('Progress saved to file');

                // Check if all puzzles are complete
                if (this.config.currentShadowGame.currentProgress >= this.config.currentShadowGame.puzzles.length) {
                    await this.revealShadowChallenge(message);
                } else {
                    // Show next error after a short delay
                    setTimeout(async () => {
                        const nextPuzzle = this.config.currentShadowGame.puzzles[this.config.currentShadowGame.currentProgress];
                        const nextErrorEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('SYSTEM ERROR')
                            .setDescription('```ansi\n\x1b[31m' + nextPuzzle.error + '\x1b[0m```')
                            .setFooter({ text: `ERROR_ID: ${Date.now().toString(36).toUpperCase()}` });

                        await message.channel.send({ embeds: [nextErrorEmbed] });
                    }, 2000); // 2 second delay before showing next error
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

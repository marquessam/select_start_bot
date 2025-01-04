const { EmbedBuilder } = require('discord.js');
const database = require('./database');

class ShadowGame {
    constructor() {
        this.config = null;
        this.errorChance = 0.50; // 50% chance to show error after commands
    }

    async resetProgress() {
        try {
            let shadowGame = await database.getShadowGame();
            shadowGame.currentProgress = 0;
            await database.saveShadowGame(shadowGame);
            return true;
        } catch (error) {
            console.error('Error resetting shadow game progress:', error);
            return false;
        }
    }
    
    async loadConfig() {
        try {
            this.config = await database.getShadowGame();
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
            
            if (!this.config || !this.config.active) {
                console.log('No valid config found or shadow game not active');
                return;
            }

            const currentPuzzle = this.config.puzzles[this.config.currentProgress];
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
                await this.resetProgress();
                console.log('Progress reset to 0');
                
                // Reload config to get fresh state
                await this.loadConfig();
                
                // Send confirmation
                await message.channel.send('```ansi\n\x1b[32m[SYSTEM RESET COMPLETE]\n[Ready for input]█\x1b[0m```');
                
                // Show first error again
                const firstPuzzle = this.config.puzzles[0];
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('SYSTEM ERROR')
                    .setDescription('```ansi\n\x1b[31m' + firstPuzzle.error + '\x1b[0m```')
                    .setFooter({ text: `ERROR_ID: ${Date.now().toString(36).toUpperCase()}` });

                await message.channel.send({ embeds: [errorEmbed] });
                return;
            }

            // Safety checks
            if (!this.config || !this.config.active) {
                console.log('No valid config found or shadow game not active');
                return;
            }

            const currentPuzzle = this.config.puzzles[this.config.currentProgress];
            if (!currentPuzzle) {
                console.log('No puzzle found for current progress');
                return;
            }

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
                this.config.currentProgress++;
                console.log('New progress:', this.config.currentProgress);
                
                // Save to database
                await database.saveShadowGame(this.config);
                console.log('Progress saved to database');

                // Check if all puzzles are complete
                if (this.config.currentProgress >= this.config.puzzles.length) {
                    await this.revealShadowChallenge(message);
                } else {
                    // Show next error after a short delay
                    setTimeout(async () => {
                        const nextPuzzle = this.config.puzzles[this.config.currentProgress];
                        const nextErrorEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('SYSTEM ERROR')
                            .setDescription('```ansi\n\x1b[31m' + nextPuzzle.error + '\x1b[0m```')
                            .setFooter({ text: `ERROR_ID: ${Date.now().toString(36).toUpperCase()}` });

                        await message.channel.send({ embeds: [nextErrorEmbed] });
                    }, 2000);
                }
            }
        } catch (error) {
            console.error('Error in checkMessage:', error);
        }
    }

    async revealShadowChallenge(message) {
        try {
            const reward = this.config.finalReward;
            
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

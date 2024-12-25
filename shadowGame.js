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
        console.log('tryShowError called');
        
        // Get current progress from config
        const progress = this.config.currentProgress || 0;
        console.log('Current progress:', progress);

        // Verify configuration
        if (!this.config || !this.config.currentShadowGame || !this.config.currentShadowGame.active) {
            console.log('Invalid config state:', this.config);
            return;
        }

        // Random chance check
        const roll = Math.random();
        if (roll > this.errorChance) {
            console.log('Random check failed');
            return;
        }

        // Get puzzle based on current progress
        const currentPuzzle = this.config.currentShadowGame.puzzles[progress];
        console.log('Current puzzle:', currentPuzzle);
        
        if (!currentPuzzle) {
            console.log('No puzzle found or all puzzles complete');
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
        console.log('Current progress before check:', this.config.currentProgress);

        if (!this.config) {
            await this.loadConfig();
        }

        const currentPuzzle = this.config.currentShadowGame.puzzles[this.config.currentProgress];
        
        if (message.content.toLowerCase() === currentPuzzle.solution.toLowerCase()) {
            console.log('Solution matched!');
            
            // Update progress
            this.config.currentProgress = (this.config.currentProgress || 0) + 1;
            console.log('New progress:', this.config.currentProgress);

            // Save updated progress to file
            try {
                await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
                console.log('Progress saved to file');
            } catch (writeError) {
                console.error('Error saving progress:', writeError);
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('ERROR RESOLVED')
                .setDescription('```ansi\n\x1b[32m' + currentPuzzle.completion_message + '\x1b[0m```')
                .setFooter({ text: `REPAIR_ID: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });

            if (this.config.currentProgress >= this.config.currentShadowGame.puzzles.length) {
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

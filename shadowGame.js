const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class ShadowGame {
    constructor() {
        this.configPath = path.join(__dirname, 'shadowGame.json');
        this.config = null;
        this.errorChance = 0.35; // 35% chance to show error after commands
    }

    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
        } catch (error) {
            console.error('Error loading shadow game config:', error);
            throw error;
        }
    }

    async tryShowError(message) {
        if (!this.config.currentShadowGame.active) return;
        if (Math.random() > this.errorChance) return;

        const currentPuzzle = this.config.currentShadowGame.puzzles[this.config.currentProgress];
        
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('SYSTEM ERROR')
            .setDescription('```ansi\n\x1b[31m' + currentPuzzle.error + '\x1b[0m```')
            .setFooter({ text: `ERROR_ID: ${Date.now().toString(36).toUpperCase()}` });

        await message.channel.send({ embeds: [embed] });
    }

 async checkMessage(message) {
    if (!this.config || !this.config.currentShadowGame || !this.config.currentShadowGame.active) return;
    if (!message.content.startsWith('!')) return;

    const currentPuzzle = this.config.currentShadowGame.puzzles?.[this.config.currentProgress];
    if (!currentPuzzle) return; // Add this safety check
        
    if (message.content.toLowerCase() === currentPuzzle.solution.toLowerCase()) {
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('ERROR RESOLVED')
            .setDescription('```ansi\n\x1b[32m' + currentPuzzle.completion_message + '\x1b[0m```')
            .setFooter({ text: `REPAIR_ID: ${Date.now().toString(36).toUpperCase()}` });

        await message.channel.send({ embeds: [embed] });

        // Move to next puzzle or reveal shadow challenge
        if (this.config.currentProgress < this.config.currentShadowGame.puzzles.length - 1) {
            this.config.currentProgress++;
            await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
        } else {
            await this.revealShadowChallenge(message);
        }
    }
}

    async revealShadowChallenge(message) {
        const reward = this.config.currentShadowGame.finalReward;
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('SYSTEM RESTORED')
            .setDescription('```ansi\n\x1b[32m[HIDDEN DATA RECOVERED]\n\nSystem repairs have revealed classified data:\n\n' + reward.gameName + '\n\nThis challenge may be completed alongside the monthly mission.\nCompletion will award ' + reward.points + ' yearly points.\x1b[0m```')
            .setURL(`https://retroachievements.org/game/${reward.gameId}`)
            .setFooter({ text: `CLEARANCE_ID: ${Date.now().toString(36).toUpperCase()}` });

        await message.channel.send({ embeds: [embed] });
    }
}

module.exports = ShadowGame;

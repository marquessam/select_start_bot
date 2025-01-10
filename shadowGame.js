import { EmbedBuilder } from 'discord.js';
import database from '../database.js';

class ShadowGame {
    constructor() {
        this.config = null;
        this.errorChance = 0.99;
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

    async initialize(gameData = null) {
        try {
            if (gameData) {
                // Initialize with provided data
                await database.saveShadowGame(gameData);
            }
            await this.loadConfig();
            return true;
        } catch (error) {
            console.error('Error initializing shadow game:', error);
            return false;
        }
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

    async tryShowError(message) {
        try {
            if (!this.config || !this.config.active) {
                return;
            }

            const currentPuzzle = this.config.puzzles[this.config.currentProgress];
            if (!currentPuzzle) {
                return;
            }

            const roll = Math.random();
            if (roll > this.errorChance) {
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

    async processCommand(message, command) {
        try {
            switch (command) {
                case 'reset':
                    await this.handleReset(message);
                    break;
                case 'init':
                    await this.handleInit(message);
                    break;
                default:
                    await this.checkMessage(message);
            }
        } catch (error) {
            console.error('Error processing shadow command:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Shadow game command failed\n[Ready for input]█\x1b[0m```');
        }
    }

    async handleReset(message) {
        await this.resetProgress();
        await this.loadConfig();
        
        await message.channel.send('```ansi\n\x1b[32m[SYSTEM RESET COMPLETE]\n[Ready for input]█\x1b[0m```');
        
        const firstPuzzle = this.config.puzzles[0];
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('SYSTEM ERROR')
            .setDescription('```ansi\n\x1b[31m' + firstPuzzle.error + '\x1b[0m```')
            .setFooter({ text: `ERROR_ID: ${Date.now().toString(36).toUpperCase()}` });

        await message.channel.send({ embeds: [errorEmbed] });
    }

    async handleInit(message) {
        const shadowGameData = {
            active: true,
            currentProgress: 0,
            puzzles: [
                {
                    error: "ERROR 0xCT01: Timeline database corrupted\nExpected value 'date.presentday.timeline' not found\nAttempting recovery of time marker...",
                    solution: "!1000AD",
                    completion_message: "[RECOVERED] Present day timeline restored\n[WARNING] Additional timeline anomaly detected in Middle Ages..."
                },
                {
                    error: "ERROR 0xCT02: Paradox detected in Middle Ages\nAnomalous dual existence: LEANNE.entity and MARLE.entity\nExpected value 'date.middleages.timeline' not found\nAttempting timeline calibration...",
                    solution: "!600AD",
                    completion_message: "[RECOVERED] Middle Ages timeline stabilized\n[WARNING] Future timeline corruption detected..."
                },
                {
                    error: "ERROR 0xCT03: Future systems critical\nLife support failing: DOME_NETWORK.status = CRITICAL\nExpected value 'date.futureapocalypse.timeline' corrupted\nAttempting emergency time sync...",
                    solution: "!2300AD",
                    completion_message: "[RECOVERED] Future timeline synchronized\n[WARNING] Day of Lavos temporal anomaly detected..."
                },
                {
                    error: "ERROR 0xCT04: LAVOS.emergence_date corrupted\nCatastrophic event timeline unstable\nExpected value 'date.lavos.timeline' not found\nAttempting temporal stabilization...",
                    solution: "!1999AD",
                    completion_message: "[RECOVERED] Day of Lavos timepoint restored\n[WARNING] Prehistoric data corruption detected..."
                },
                {
                    error: "ERROR 0xCT05: Prehistoric database overflow\nAEON.sys temporal boundary exceeded\nExpected value 'prehistory.timeline' not found\nAttempting primitive era recovery...",
                    solution: "!65000000BC",
                    completion_message: "[RECOVERED] Prehistoric era restored\n[SUCCESS] All temporal anomalies resolved\n[ACCESSING HIDDEN DATA...]"
                }
            ],
            finalReward: {
                gameId: "10024",
                gameName: "MarioTennis",
                points: 2
            }
        };

        await this.initialize(shadowGameData);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('SHADOW GAME INITIALIZED')
            .setDescription('```ansi\n\x1b[32m[DATABASE UPDATE COMPLETE]\n[SHADOW SYSTEM CONFIGURED]\x1b[0m```')
            .addFields({
                name: 'VERIFICATION',
                value: '```ansi\n\x1b[32m' +
                    `Active: ${this.config.active}\n` +
                    `Puzzles: ${this.config.puzzles.length}\n` +
                    `Current Progress: ${this.config.currentProgress}\x1b[0m` +
                    '```'
            })
            .setFooter({ text: `INIT_ID: ${Date.now().toString(36).toUpperCase()}` });

        await message.channel.send({ embeds: [embed] });
        await message.channel.send('```ansi\n\x1b[32m> Type !shadowreset to begin the game\n[Ready for input]█\x1b[0m```');
    }

    async checkMessage(message) {
        try {
            if (!this.config || !this.config.active) {
                return;
            }

            const currentPuzzle = this.config.puzzles[this.config.currentProgress];
            if (!currentPuzzle) {
                return;
            }

            if (message.content.toLowerCase() === currentPuzzle.solution.toLowerCase()) {
                await this.handleCorrectSolution(message, currentPuzzle);
            }
        } catch (error) {
            console.error('Error in checkMessage:', error);
        }
    }

    async handleCorrectSolution(message, puzzle) {
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('ERROR RESOLVED')
            .setDescription('```ansi\n\x1b[32m' + puzzle.completion_message + '\x1b[0m```')
            .setFooter({ text: `REPAIR_ID: ${Date.now().toString(36).toUpperCase()}` });
        
        await message.channel.send({ embeds: [embed] });
        
        this.config.currentProgress++;
        await database.saveShadowGame(this.config);

        if (this.config.currentProgress >= this.config.puzzles.length) {
            await this.revealShadowChallenge(message);
        } else {
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

    async revealShadowChallenge(message) {
        try {
            const reward = this.config.finalReward;
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('SYSTEM RESTORED')
                .setDescription('```ansi\n\x1b[32m[HIDDEN DATA RECOVERED]\n\nSystem repairs have revealed classified data:\n\n' + 
                    reward.gameName + '\n\nThis challenge may be completed alongside the monthly mission.\n' +
                    'Completion will award ' + reward.points + ' yearly points.\x1b[0m```')
                .setURL(`https://retroachievements.org/game/${reward.gameId}`)
                .setFooter({ text: `CLEARANCE_ID: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error in revealShadowChallenge:', error);
        }
    }
}

export default ShadowGame;

const { EmbedBuilder } = require('discord.js');
const database = require('./database');
const { fetchLeaderboardData } = require('./raAPI');
const { withTransaction } = require('./utils/transactions');

class ShadowGame {
    constructor() {
        this.config = null;
        this.errorChance = 0.99;
        this.database = require('./database'); // Add database requirement
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
                // Initialize default point values
                if (!gameData.points) {
                    gameData.points = {
                        participation: 1,
                        beaten: 3
                    };
                }
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
            points: {
                participation: 1,
                beaten: 3
            },
            puzzles: [
                {
                    error: "ERROR 0xCT01: Timeline database corrupted\nExpected value 'date.presentday.timeline' not found\nAttempting recovery of time marker...\n\n\x1b[37mPlease input !<year> to continue\x1b[0m",
                    solution: "!1000AD",
                    completion_message: "[RECOVERED] Present day timeline restored\n[WARNING] Additional timeline anomaly detected in Middle Ages..."
                },
                {
                    error: "ERROR 0xCT02: Paradox detected in Middle Ages\nAnomalous dual existence: LEANNE.entity and MARLE.entity\nExpected value 'date.middleages.timeline' not found\nAttempting timeline calibration...\n\n\x1b[37mPlease input !<year> to continue\x1b[0m",
                    solution: "!600AD",
                    completion_message: "[RECOVERED] Middle Ages timeline stabilized\n[WARNING] Future timeline corruption detected..."
                },
                {
                    error: "ERROR 0xCT03: Future systems critical\nLife support failing: DOME_NETWORK.status = CRITICAL\nExpected value 'date.futureapocalypse.timeline' corrupted\nAttempting emergency time sync...\n\n\x1b[37mPlease input !<year> to continue\x1b[0m",
                    solution: "!2300AD",
                    completion_message: "[RECOVERED] Future timeline synchronized\n[WARNING] Day of Lavos temporal anomaly detected..."
                },
                {
                    error: "ERROR 0xCT04: LAVOS.emergence_date corrupted\nCatastrophic event timeline unstable\nExpected value 'date.lavos.timeline' not found\nAttempting temporal stabilization...\n\n\x1b[37mPlease input !<year> to continue\x1b[0m",
                    solution: "!1999AD",
                    completion_message: "[RECOVERED] Day of Lavos timepoint restored\n[WARNING] Prehistoric data corruption detected..."
                },
                {
                    error: "ERROR 0xCT05: Prehistoric database overflow\nAEON.sys temporal boundary exceeded\nExpected value 'prehistory.timeline' not found\nAttempting primitive era recovery...\n\n\x1b[37mPlease input !<year> to continue\x1b[0m",
                    solution: "!65000000BC",
                    completion_message: "[RECOVERED] Prehistoric era restored\n[SUCCESS] All temporal anomalies resolved\n[ACCESSING HIDDEN DATA...]"
                }
            ],
            finalReward: {
                gameId: "10024",
                gameName: "Mario Tennis",
                points: "Participation: 1, Beaten: 3"
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

    async checkAchievements(userStats) {
        if (!this.config || !this.config.active || !this.config.finalReward?.gameId) {
            return;
        }

        try {
            const data = await fetchLeaderboardData();
            if (!data?.leaderboard) return;

            await Promise.all(data.leaderboard.map(async (user) => {
                const username = user.username.toLowerCase();
                
                // Check participation
                if (user.completedAchievements > 0) {
                    const participationKey = `shadow-participation-${this.config.finalReward.gameId}`;
                    const stats = await this.database.getUserStats();
                    
                    // Get user's existing points
                    if (!stats.users?.[username]?.bonusPoints?.some(bp => 
                        bp.internalReason?.includes(participationKey)
                    )) {
                        await userStats.addBonusPoints(
                            username,
                            this.config.points.participation,
                            {
                                reason: `${this.config.finalReward.gameName} - Shadow Game Participation`,
                                internalReason: `${this.config.finalReward.gameName} - Shadow Game Participation (${participationKey})`
                            }
                        );
                    }
                }

                // Check for specific beaten achievements (48411 or 48412)
                const hasBeatenGame = user.achievements?.some(ach => 
                    (ach.ID === '48411' || ach.ID === '48412') && 
                    parseInt(ach.DateEarned) > 0
                );

                if (hasBeatenGame) {
                    const beatenKey = `shadow-beaten-${this.config.finalReward.gameId}`;
                    const stats = await this.database.getUserStats();
                    
                    // Get user's existing points
                    if (!stats.users?.[username]?.bonusPoints?.some(bp => 
                        bp.internalReason?.includes(beatenKey)
                    )) {
                        await userStats.addBonusPoints(
                            username,
                            this.config.points.beaten,
                            {
                                reason: `${this.config.finalReward.gameName} - Shadow Game Beaten`,
                                internalReason: `${this.config.finalReward.gameName} - Shadow Game Beaten (${beatenKey})`
                            }
                        );
                    }
                }
            }));

            // Update leaderboard
            if (global.leaderboardCache) {
                await global.leaderboardCache.updateLeaderboards(true);
            }

        } catch (error) {
            console.error('Error checking shadow game achievements:', error);
        }
    }

   async revealShadowChallenge(message) {
        try {
            const reward = this.config.finalReward;
            
            // Ensure points structure exists with defaults
            if (!this.config.points) {
                this.config.points = {
                    participation: 1,
                    beaten: 3
                };
                // Save the updated config with points
                await database.saveShadowGame(this.config);
            }
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('SYSTEM RESTORED')
               .setDescription(
        '```ansi\n' +
        '\x1b[32m[HIDDEN DATA RECOVERED]\n\n' +
        'System repairs have revealed classified data:\n\n' + 
        `${reward.gameName} (N64)\n\n` +
        'This challenge may be completed alongside the monthly mission.\n' +
        'Points awarded:\n' +
        `Participation: ${this.config.points.participation} point\n` +
        `Game Beaten: ${this.config.points.beaten} points` +
        '\x1b[0m```'
    )
                .setURL(`https://retroachievements.org/game/${reward.gameId}`)
                .setFooter({ text: `CLEARANCE_ID: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
            
            // Schedule periodic achievement checks
            setInterval(() => this.checkAchievements(), 5 * 60 * 1000); // Check every 5 minutes
        } catch (error) {
            console.error('Error in revealShadowChallenge:', error);
            // Send a fallback message in case of error
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reveal shadow challenge\n[Ready for input]█\x1b[0m```');
        }
    }
}

module.exports = ShadowGame;

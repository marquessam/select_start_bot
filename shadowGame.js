// shadowGame.js
const { EmbedBuilder } = require('discord.js');
const database = require('./database');
const { fetchLeaderboardData } = require('./raAPI');

class ShadowGame {
    constructor() {
        this.config = null;
        this.database = require('./database');
    }

    async loadConfig() {
        try {
            this.config = await database.getShadowGame();
            return true;
        } catch (error) {
            console.error('Error loading shadow game config:', error);
            return false;
        }
    }

    async initialize(gameData = null) {
        try {
            const shadowGameData = {
                active: true,
                currentProgress: 0,
                triforceState: {
                    wisdom: {
                        required: 6,
                        found: 0,
                        pieces: [
                            "W1X4BY",  // Profile display
                            "W2K5MN",  // Monthly leaderboard
                            "W3R8ST",  // Arcade scores
                            "W4Y6PV",  // Achievement feed
                            "W5J9CH",  // Reviews
                            "W6F7GD"   // Nominations
                        ],
                        collected: new Set()
                    },
                    courage: {
                        required: 6,
                        found: 0,
                        pieces: [
                            "C1B5NM",  // Help command
                            "C2K4LP",  // Archive viewer
                            "C3R8TW",  // Rules display
                            "C4Y2XQ",  // Search results
                            "C5V5BN",  // Monthly standings
                            "C6H7JD"   // Points awards
                        ],
                        collected: new Set()
                    },
                    power: {
                        collected: false
                    }
                },
                finalReward: {
                    gameId: "274",
                    gameName: "U.N. Squadron",
                    points: {
                        participation: 1,
                        beaten: 3
                    }
                }
            };
            
            await database.saveShadowGame(shadowGameData);
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
            shadowGame.triforceState = {
                wisdom: {
                    required: 6,
                    found: 0,
                    pieces: [
                        "W1X4BY", "W2K5MN", "W3R8ST",
                        "W4Y6PV", "W5J9CH", "W6F7GD"
                    ],
                    collected: new Set()
                },
                courage: {
                    required: 6,
                    found: 0,
                    pieces: [
                        "C1B5NM", "C2K4LP", "C3R8TW",
                        "C4Y2XQ", "C5V5BN", "C6H7JD"
                    ],
                    collected: new Set()
                },
                power: {
                    collected: false
                }
            };
            await database.saveShadowGame(shadowGame);
            return true;
        } catch (error) {
            console.error('Error resetting shadow game:', error);
            return false;
        }
    }

    async checkMessage(message) {
        try {
            if (!this.config || !message.content.startsWith('!triforce')) {
                return;
            }

            const args = message.content.split(/\s+/);
            
            if (args.length === 1) {
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
                    );

                embed.addFields({
                    name: 'SACRED REALM STATUS',
                    value: this.getTriforceStatus()
                });

                await message.channel.send({ embeds: [embed] });
                return;
            }

            if (args.length === 2 && args[1].toLowerCase() === 'power') {
                await this.checkTriforce(message, 'power');
                return;
            }

            if (args.length === 3) {
                await this.checkTriforce(message, args[1], args[2]);
            }
        } catch (error) {
            console.error('Error in checkMessage:', error);
        }
    }

    async checkTriforce(message, piece, code = null) {
        switch(piece.toLowerCase()) {
            case 'wisdom':
            case 'courage':
                const triforce = this.config.triforceState[piece.toLowerCase()];
                
                if (triforce.collected.has(code)) {
                    await message.channel.send('```ansi\n\x1b[33mThis ancient power has already been restored to the Sacred Realm...\x1b[0m```');
                    return;
                }
                
                if (triforce.pieces.includes(code)) {
                    triforce.collected.add(code);
                    triforce.found++;
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle('SACRED POWER RESTORED')
                        .setDescription(
                            `A fragment of the Triforce of ${piece} resonates with ancient power!\n\n` +
                            `The Triforce of ${piece} grows stronger...\n` +
                            `${triforce.required - triforce.found} fragments remain lost in shadow.`
                        );
                    
                    await message.channel.send({ embeds: [embed] });
                    await this.handleTriforceProgress(message, piece);
                    await database.saveShadowGame(this.config);
                } else {
                    await message.channel.send('```ansi\n\x1b[31mThis incantation holds no power here...\x1b[0m```');
                }
                break;
                
            case 'power':
                // Check if anyone has beaten ALTTP
                const leaderboard = await global.leaderboardCache.getMonthlyLeaderboard();
                const anyoneBeatenGame = leaderboard.some(user => user.hasBeatenGame);
                
                if (!anyoneBeatenGame) {
                    await message.channel.send('```ansi\n\x1b[31mGanon\'s dark magic still protects the Triforce of Power...\nNone have yet proven strong enough to break his seal.\x1b[0m```');
                    return;
                }
                
                if (this.config.triforceState.wisdom.found !== this.config.triforceState.wisdom.required ||
                    this.config.triforceState.courage.found !== this.config.triforceState.courage.required) {
                    await message.channel.send('```ansi\n\x1b[31mThe Triforce remains incomplete. Wisdom and Courage must first be restored...\x1b[0m```');
                    return;
                }
                
                this.config.triforceState.power.collected = true;
                await database.saveShadowGame(this.config);
                await this.revealShadowChallenge(message);
                break;
        }
    }

    async handleTriforceProgress(message, piece) {
        const triforce = this.config.triforceState[piece.toLowerCase()];
        
        if (triforce.found === triforce.required) {
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`THE TRIFORCE OF ${piece.toUpperCase()} AWAKENS`)
                .setDescription(
                    `The Triforce of ${piece} pulses with renewed power!\n` +
                    `Its ancient strength has been restored!`
                );
                
            await message.channel.send({ embeds: [embed] });
            
            if (this.config.triforceState.wisdom.found === this.config.triforceState.wisdom.required &&
                this.config.triforceState.courage.found === this.config.triforceState.courage.required) {
                
                await message.channel.send('```ansi\n' +
                    '\x1b[33mWisdom and Courage shine with sacred light!\n\n' +
                    'But darkness still grips the Triforce of Power...\n' +
                    'Only by defeating Ganon can the final piece be claimed.\n\n' +
                    'Face your destiny, hero...\x1b[0m```');
            }
        }
    }

    getTriforceStatus() {
    // Add null checks and default values
    if (!this.config || !this.config.triforceState) {
        return 'ERROR: Sacred Realm data corrupted';
    }

    const wisdom = this.config.triforceState.wisdom || { found: 0, required: 6 };
    const courage = this.config.triforceState.courage || { found: 0, required: 6 };
    const power = this.config.triforceState.power || { collected: false };
    
    return `Triforce of Wisdom: ${wisdom.found || 0} fragments restored\n` +
           `Triforce of Courage: ${courage.found || 0} fragments restored\n` +
           `Triforce of Power: ${power.collected ? 'Reclaimed from darkness' : 'Held by Ganon'}`;
}

    async revealShadowChallenge(message) {
        try {
            const reward = this.config.finalReward;
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('THE TRIFORCE UNITED')
                .setDescription(
                    '```ansi\n' +
                    '\x1b[33mAs the three golden triangles resonate as one, ' +
                    'a new trial emerges from the shadows...\n\n' +
                    `${reward.gameName}\n\n` +
                    'This challenge may be undertaken alongside your current quest.\n' +
                    'Rewards for the worthy:\n' +
                    `Mark of Participation: ${reward.points.participation} sacred point\n` +
                    `Mark of Completion: ${reward.points.beaten} sacred points` +
                    '\x1b[0m```'
                )
                .setURL(`https://retroachievements.org/game/${reward.gameId}`)
                .setFooter({ text: `SACRED_SEAL: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
            setInterval(() => this.checkAchievements(), 5 * 60 * 1000);
        } catch (error) {
            console.error('Error in revealShadowChallenge:', error);
            await message.channel.send('```ansi\n\x1b[31mA dark power prevents the revelation...\x1b[0m```');
        }
    }

    async checkAchievements(userStats) {
        if (!this.config || !this.config.triforceState.power.collected || !this.config.finalReward?.gameId) {
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
                    if (!(await database.hasUserBonusPoints(username, participationKey))) {
                        await userStats.addBonusPoints(
                            username,
                            this.config.finalReward.points.participation,
                            `${this.config.finalReward.gameName} - Shadow Challenge Begun`
                        );
                    }
                }

                // Check for completion
                if (user.hasBeatenGame) {
                    const beatenKey = `shadow-beaten-${this.config.finalReward.gameId}`;
                    if (!(await database.hasUserBonusPoints(username, beatenKey))) {
                        await userStats.addBonusPoints(
                            username,
                            this.config.finalReward.points.beaten,
                            `${this.config.finalReward.gameName} - Shadow Challenge Mastered`
                        );
                    }
                }
            }));

        } catch (error) {
            console.error('Error checking shadow game achievements:', error);
        }
    }
}

module.exports = ShadowGame;

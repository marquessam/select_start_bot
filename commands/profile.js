// commands/profile.js
const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

module.exports = {
    name: 'profile',
    description: 'Displays user profile and achievement progress',
    async execute(message, args, { shadowGame, achievementSystem }) {
        try {
            if (!args.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const username = args[0].toLowerCase();
            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            // Validate user
            const validUsers = await DataService.getValidUsers();
            if (!validUsers.includes(username)) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" is not a registered participant\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            // Get current month/year
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            // Fetch all necessary data concurrently
            const [
                currentChallenge,
                userProgress,
                achievementData,
                raProfileImage
            ] = await Promise.all([
                DataService.getCurrentChallenge(),
                DataService.getUserProgress(username),
                achievementSystem.calculatePoints(username, currentMonth, currentYear),
                DataService.getRAProfileImage(username)
            ]);

            // Create embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username.toUpperCase()}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]');

            // Add current challenge progress
            if (currentChallenge) {
                const gameAchievements = achievementData.games[currentChallenge.gameId] || { achievements: [] };
                const hasParticipation = gameAchievements.achievements.some(a => a.type === 'participation');
                const hasBeaten = gameAchievements.achievements.some(a => a.type === 'beaten');
                const hasMastery = gameAchievements.achievements.some(a => a.type === 'mastery');

                embed.addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: "${currentChallenge.gameName}"\n` +
                    `PROGRESS: ${userProgress.completionPercentage}%\n` +
                    `ACHIEVEMENTS: ${userProgress.completedAchievements}/${userProgress.totalAchievements}\n` +
                    `STATUS:\n` +
                    `${hasParticipation ? '✓' : '⬚'} Participation\n` +
                    `${hasBeaten ? '✓' : '⬚'} Completion\n` +
                    `${hasMastery ? '✓' : '⬚'} Mastery`
                );
            }

            // Group achievements by game
            const gameProgress = {};
            for (const [gameId, gameData] of Object.entries(achievementData.games)) {
                if (!gameProgress[gameId]) {
                    gameProgress[gameId] = {
                        name: gameData.name,
                        achievements: {
                            participation: false,
                            beaten: false,
                            mastery: false
                        },
                        points: gameData.points
                    };
                }

                // Mark which achievements have been earned
                for (const achievement of gameData.achievements) {
                    gameProgress[gameId].achievements[achievement.type] = true;
                }
            }

            // Show monthly progress for each game
            for (const [gameId, game] of Object.entries(gameProgress)) {
                const achievements = [];
                if (game.achievements.participation) achievements.push('Participation');
                if (game.achievements.beaten) achievements.push('Game Beaten');
                if (game.achievements.mastery) achievements.push('Mastery');

                embed.addTerminalField(game.name,
                    `ACHIEVEMENTS EARNED:\n` +
                    achievements.map(a => `✓ ${a}`).join('\n') +
                    `\nTOTAL POINTS: ${game.points}`
                );
            }

            // Show yearly totals
            const yearlyData = await achievementSystem.calculatePoints(username, null, currentYear);
            const yearStats = {
                gamesParticipated: Object.keys(yearlyData.games).length,
                totalPoints: yearlyData.total,
                gamesBeaten: Object.values(yearlyData.games)
                    .filter(g => g.achievements.some(a => a.type === 'beaten')).length,
                gamesMastered: Object.values(yearlyData.games)
                    .filter(g => g.achievements.some(a => a.type === 'mastery')).length
            };

            embed.addTerminalField(`${currentYear} STATISTICS`,
                `GAMES PARTICIPATED: ${yearStats.gamesParticipated}\n` +
                `GAMES BEATEN: ${yearStats.gamesBeaten}\n` +
                `GAMES MASTERED: ${yearStats.gamesMastered}\n` +
                `TOTAL POINTS: ${yearStats.totalPoints}`
            );

            // Set profile image if available
            if (raProfileImage) {
                embed.setThumbnail(raProfileImage);
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });

            if (shadowGame?.tryShowError) {
                await shadowGame.tryShowError(message);
            }

        } catch (error) {
            console.error('[PROFILE] Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    }
};

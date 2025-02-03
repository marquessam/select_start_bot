// commands/profile.js
const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

module.exports = {
    name: 'profile',
    description: 'Displays user profile and stats',

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
                currentPoints,
                yearlyPoints,
                raProfileImage
            ] = await Promise.all([
                DataService.getCurrentChallenge(),
                DataService.getUserProgress(username),
                achievementSystem.calculatePoints(username, currentMonth, currentYear),
                achievementSystem.calculatePoints(username, null, currentYear),
                DataService.getRAProfileImage(username)
            ]);

            // Create embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username.toUpperCase()}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]');

            // Add current challenge progress
            if (currentChallenge) {
                embed.addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: "${currentChallenge.gameName}"\n` +
                    `PROGRESS: ${userProgress?.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${userProgress?.completedAchievements || 0}/${userProgress?.totalAchievements || 0}\n` +
                    (userProgress?.hasBeatenGame ? '✅ Game Completed' : '⏳ In Progress')
                );
            }

            // Show monthly/yearly points
            embed.addTerminalField('POINTS SUMMARY',
                `CURRENT MONTH: ${currentPoints.total} points\n` +
                `YEARLY TOTAL: ${yearlyPoints.total} points`
            );

            // Add monthly game breakdown
            for (const [gameId, gameData] of Object.entries(currentPoints.games)) {
                const achievements = gameData.achievements.sort((a, b) => 
                    new Date(b.date) - new Date(a.date)
                );

                const achievementList = achievements.map(ach => 
                    `${ach.type}: ${ach.points} point${ach.points !== 1 ? 's' : ''}`
                ).join('\n');

                embed.addTerminalField(gameData.name,
                    `${achievementList}\n` +
                    `TOTAL: ${gameData.points} points`
                );
            }

            // Show yearly stats
            const yearStats = {
                gamesParticipated: new Set(Object.keys(yearlyPoints.games)).size,
                totalPoints: yearlyPoints.total,
                gamesBeaten: Object.values(yearlyPoints.games).filter(g => 
                    g.achievements.some(a => a.type === 'beaten')
                ).length,
                gamesMastered: Object.values(yearlyPoints.games).filter(g => 
                    g.achievements.some(a => a.type === 'mastery')
                ).length
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
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');

            if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);

        } catch (error) {
            console.error('[PROFILE] Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    }
};

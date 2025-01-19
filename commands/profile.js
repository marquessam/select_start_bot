// profile.js
const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

function calculateRank(username, leaderboard, rankMetric) {
    const user = leaderboard.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || rankMetric(user) === 0) {
        return 'No Rank';
    }

    const sortedLeaderboard = [...leaderboard]
        .filter(u => rankMetric(u) > 0)
        .sort((a, b) => rankMetric(b) - rankMetric(a));

    let rank = 1;
    let previousValue = null;

    for (let i = 0; i < sortedLeaderboard.length; i++) {
        const currentValue = rankMetric(sortedLeaderboard[i]);
        if (currentValue !== previousValue) {
            rank = i + 1;
            previousValue = currentValue;
        }
        if (sortedLeaderboard[i].username.toLowerCase() === username.toLowerCase()) {
            return `#${rank}`;
        }
    }

    return 'No Rank';
}

function organizePointsBreakdown(bonusPoints) {
    const categories = {
        'Participations': [],
        'Games Beaten': [],
        'Games Mastered': [],
        'Other': []
    };

    bonusPoints.forEach(point => {
        const reason = point.displayReason || point.reason;
        if (reason.includes('Participation')) {
            categories['Participations'].push(`${reason}: ${point.points} pts`);
        } else if (reason.includes('Beaten')) {
            categories['Games Beaten'].push(`${reason}: ${point.points} pts`);
        } else if (reason.includes('Mastery')) {
            categories['Games Mastered'].push(`${reason}: ${point.points} pts`);
        } else {
            categories['Other'].push(`${reason}: ${point.points} pts`);
        }
    });

    return Object.entries(categories)
        .filter(([_, points]) => points.length > 0)
        .map(([category, points]) => `${category}:\n${points.join('\n')}`)
        .join('\n\n');
}

function calculateYearlyStats(bonusPoints) {
    return {
        participations: bonusPoints.filter(p => (p.displayReason || p.reason).includes('Participation')).length,
        gamesBeaten: bonusPoints.filter(p => (p.displayReason || p.reason).includes('Beaten')).length,
        gamesMastered: bonusPoints.filter(p => (p.displayReason || p.reason).includes('Mastery')).length,
        totalPoints: bonusPoints.reduce((sum, p) => sum + p.points, 0)
    };
}

async function getInitialUserData(username, userStats) {
    const cleanUsername = username.toLowerCase();
    const validUsers = await DataService.getValidUsers();
    
    if (!validUsers.includes(cleanUsername)) {
        return null;
    }

    if (userStats) {
        await userStats.initializeUserIfNeeded(cleanUsername);
    }

    return cleanUsername;
}

module.exports = {
    name: 'profile',
    description: 'Displays enhanced user profile and stats',
    
    async execute(message, args, { shadowGame, userStats }) {
        try {
            if (!args.length) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const username = args[0];
            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            const validatedUser = await getInitialUserData(username, userStats);
            if (!validatedUser) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" is not a registered participant\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            // Fetch all necessary data
            const [
                userStatsData,
                userProgress,
                currentChallenge,
                yearlyLeaderboard,
                raProfileImage,
                validUsers,
                monthlyLeaderboard
            ] = await Promise.all([
                DataService.getUserStats(validatedUser),
                DataService.getUserProgress(validatedUser),
                DataService.getCurrentChallenge(),
                DataService.getLeaderboard('yearly'),
                DataService.getRAProfileImage(validatedUser),
                DataService.getValidUsers(),
                DataService.getLeaderboard('monthly')
            ]);

            const currentYear = new Date().getFullYear().toString();

            // Get yearly data with defaults
            const yearlyData = yearlyLeaderboard.find(user => 
                user.username.toLowerCase() === validatedUser
            ) || {
                points: 0,
                achievementsUnlocked: 0
            };

            // Process bonus points
            const bonusPoints = userStatsData?.bonusPoints?.filter(bonus => 
                bonus.year === currentYear
            ) || [];

            const yearlyStats = calculateYearlyStats(bonusPoints);
            const organizedPoints = organizePointsBreakdown(bonusPoints);

            // Calculate ranks
            const yearlyRankText = calculateRank(validatedUser, yearlyLeaderboard, 
                user => user.points || 0
            );

            const monthlyRankText = calculateRank(validatedUser, monthlyLeaderboard,
                user => user.completionPercentage || 0
            );

            // Create embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge?.gameName || 'N/A'}\n` +
                    `PROGRESS: ${userProgress.completionPercentage || 0}%\n` +
                    `ACHIEVEMENTS: ${userProgress.completedAchievements || 0}/${userProgress.totalAchievements || 0}`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRankText}\n` +
                    `YEARLY RANK: ${yearlyRankText}`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `ACHIEVEMENTS EARNED: ${yearlyData.achievementsUnlocked || userProgress.completedAchievements || 0}\n` +
                    `GAMES PARTICIPATED: ${yearlyStats.participations}\n` +
                    `GAMES BEATEN: ${yearlyStats.gamesBeaten}\n` +
                    `GAMES MASTERED: ${yearlyStats.gamesMastered}`)
                .addTerminalField('POINT BREAKDOWN', organizedPoints)
                .addTerminalField('POINT TOTAL', `${yearlyStats.totalPoints} points`);

            if (raProfileImage) {
                embed.setThumbnail(raProfileImage);
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');
            
            if (shadowGame) {
                await shadowGame.tryShowError(message);
            }

        } catch (error) {
            console.error('[PROFILE] Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    }
};

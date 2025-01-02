const TerminalEmbed = require('../utils/embedBuilder');
const leaderboardCache = require('../leaderboardCache');
const { fetchUserProfile } = require('../raAPI');
const database = require('../database');

module.exports = {
    name: 'profile',
    description: 'Displays enhanced user profile and stats',
    async execute(message, args) {
        try {
            const username = args[0]?.toLowerCase();
            if (!username) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Check if user is in the valid users list
            if (!leaderboardCache.isValidUser(username)) {
                await message.channel.send(`\`\`\`ansi\n\x1b[32m[ERROR] User "${username}" is not a registered participant\n[Ready for input]█\x1b[0m\`\`\``);
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            const currentYear = new Date().getFullYear().toString();

            // Fetch data from various sources
            const yearlyLeaderboard = leaderboardCache.getYearlyLeaderboard() || [];
            const monthlyLeaderboard = leaderboardCache.getMonthlyLeaderboard() || [];
            const userProfile = await fetchUserProfile(username);
            const userStats = await database.getUserStats(username);
            const currentChallenge = await database.getCurrentChallenge();

            // Ensure stats exist for the current year
            const yearlyPoints = userStats.yearlyPoints?.[currentYear] || 0;
            const yearlyStats = userStats.yearlyStats?.[currentYear] || {
                totalGamesCompleted: 0,
                totalAchievementsUnlocked: 0,
                hardcoreCompletions: 0,
                monthlyParticipations: 0,
            };

            // Filter bonus points for the current year
            const bonusPoints = userStats.bonusPoints?.filter(bonus => bonus.year === currentYear) || [];
            const recentBonusPoints = bonusPoints
                .map(bonus => `${bonus.reason}: ${bonus.points} pts`)
                .join('\n') || 'No bonus points yet.';
            const totalBonusPoints = bonusPoints.reduce((acc, bonus) => acc + bonus.points, 0);

            // Determine user's ranks
             // Calculate ranks with ties
            const calculateRank = (username, leaderboard, getScore) => {
                if (!leaderboard || leaderboard.length === 0) return 'Not ranked';
                
                // Sort users by score in descending order
                const sortedUsers = [...leaderboard].sort((a, b) => getScore(b) - getScore(a));
                
                let currentRank = 1;
                let currentScore = getScore(sortedUsers[0]);
                let rankMap = new Map();

                sortedUsers.forEach((user, index) => {
                    const score = getScore(user);
                    if (score < currentScore) {
                        currentRank = index + 1;
                        currentScore = score;
                    }
                    rankMap.set(user.username.toLowerCase(), currentRank);
                });

                const userRank = rankMap.get(username.toLowerCase());
                return userRank ? `${userRank}/${leaderboard.length}` : 'Not ranked';
            };

            // Calculate yearly rank (based on points)
            const yearlyRankText = calculateRank(username, yearlyLeaderboard, 
                user => user.points || 0
            );

            // Calculate monthly rank (based on completion percentage)
            const monthlyRankText = calculateRank(username, monthlyLeaderboard, 
                user => user.completionPercentage || 0
            );
            // Get monthly data
            const monthlyData = monthlyLeaderboard.find(user => 
                user.username.toLowerCase() === username.toLowerCase()
            ) || {
                completionPercentage: 0,
                completedAchievements: 0,
                totalAchievements: 0,
            };

            // Create embed
            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${currentChallenge?.gameName || 'N/A'}\n` +
                    `PROGRESS: ${monthlyData.completionPercentage}%\n` +
                    `ACHIEVEMENTS: ${monthlyData.completedAchievements}/${monthlyData.totalAchievements}`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRankText}\n` +
                    `YEARLY RANK: ${yearlyRankText}`)
                .addTerminalField(`${currentYear} STATISTICS`,
                    `YEARLY POINTS: ${yearlyPoints}\n` +
                    `GAMES COMPLETED: ${yearlyStats.totalGamesCompleted}\n` +
                    `ACHIEVEMENTS UNLOCKED: ${yearlyStats.totalAchievementsUnlocked}\n` +
                    `HARDCORE COMPLETIONS: ${yearlyStats.hardcoreCompletions}\n` +
                    `MONTHLY PARTICIPATIONS: ${yearlyStats.monthlyParticipations}`)
                .addTerminalField('POINTS BREAKDOWN',
                    `${recentBonusPoints}\nTotal Bonus Points: ${totalBonusPoints}`);

            if (userProfile?.profileImage) {
                embed.setThumbnail(userProfile.profileImage);
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    },
};

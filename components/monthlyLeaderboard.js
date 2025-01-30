const TerminalEmbed = require('../utils/embedBuilder');
const DataService = require('../services/dataService');

async function displayMonthlyLeaderboard(message, shadowGame) {
    try {
        await message.channel.send('```ansi\n\x1b[32m> Accessing monthly rankings...\x1b[0m\n```');

        // Fetch all required data
        const [leaderboardData, currentChallenge, shadowGameData] = await Promise.all([
            DataService.getLeaderboard('monthly'),
            DataService.getCurrentChallenge(),
            shadowGame?.config || null
        ]);

        // Get valid users and filter for active participants
        const validUsers = await DataService.getValidUsers();
        const activeUsers = leaderboardData.filter(user =>
            validUsers.includes(user.username.toLowerCase()) &&
            (user.completedAchievements > 0 || parseFloat(user.completionPercentage) > 0)
        );

        // Sort users with tie handling
        const rankedUsers = rankUsersWithTies(activeUsers);

        const embed = new TerminalEmbed()
            .setTerminalTitle('USER RANKINGS')
            .setThumbnail(`https://retroachievements.org${currentChallenge?.gameIcon || ''}`)
            .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]')
            .addTerminalField('CURRENT CHALLENGE', 
                `GAME: ${currentChallenge?.gameName || 'Unknown'}\n` +
                `TOTAL ACHIEVEMENTS: ${activeUsers[0]?.totalAchievements || 0}`
            );

        // Add top rankings (including ties)
        let lastAddedRank = 0;
        for (const user of rankedUsers) {
            if (lastAddedRank >= 3 && user.rank > 3) break; // Only show beyond top 3 if tied

            // Check if user has completed main challenge and shadow game is active
            const showShadowProgress = user.completionPercentage === '100.00' && 
                                     shadowGameData?.active && 
                                     shadowGameData?.finalReward;

            // Find shadow game progress if needed
            let shadowProgress = null;
            if (showShadowProgress) {
                shadowProgress = activeUsers.find(u => 
                    u.username.toLowerCase() === user.username.toLowerCase() &&
                    u.achievements.some(a => a.GameID === shadowGameData.finalReward.gameId)
                );
            }

            // Get medal based on rank
            const medals = ['🥇', '🥈', '🥉'];
            const medal = user.rank <= 3 ? medals[user.rank - 1] : '';

            // Create progress text
            let progressText = `ACHIEVEMENTS: ${user.completedAchievements}/${user.totalAchievements}\n` +
                             `PROGRESS: ${user.completionPercentage}%`;

            // Add shadow game progress if applicable
            if (showShadowProgress && shadowProgress) {
                const shadowAchievements = shadowProgress.achievements.filter(
                    a => a.GameID === shadowGameData.finalReward.gameId
                );
                const completedShadow = shadowAchievements.filter(a => parseInt(a.DateEarned) > 0).length;
                const totalShadow = shadowAchievements.length;
                
                progressText += `\nSHADOW GAME: ${completedShadow}/${totalShadow} (${((completedShadow/totalShadow) * 100).toFixed(2)}%)`;
            }

            // Add field for user
            embed.addTerminalField(
                `${medal} RANK #${user.rank} - ${user.username}`,
                progressText
            );

            lastAddedRank = user.rank;
        }

        // Add remaining participants if any
        const remainingUsers = rankedUsers.filter(user => user.rank > 3 && !user.isTied);
        if (remainingUsers.length > 0) {
            const remainingText = remainingUsers
                .map(user => `${user.username} (${user.completionPercentage}%)`)
                .join('\n');

            embed.addTerminalField('ADDITIONAL PARTICIPANTS', remainingText);
        }

        if (activeUsers.length === 0) {
            embed.addTerminalField('STATUS', 'No active participants yet');
        }

        embed.setTerminalFooter();
        
        await message.channel.send({ embeds: [embed] });
        if (shadowGame) await shadowGame.tryShowError(message);

    } catch (error) {
        console.error('Monthly Leaderboard Error:', error);
        await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve monthly leaderboard\n[Ready for input]█\x1b[0m```');
    }
}

function rankUsersWithTies(users) {
    // Sort users by completion percentage and achievements
    const sortedUsers = [...users].sort((a, b) => {
        const percentDiff = parseFloat(b.completionPercentage) - parseFloat(a.completionPercentage);
        if (percentDiff !== 0) return percentDiff;
        return b.completedAchievements - a.completedAchievements;
    });

    const rankedUsers = [];
    let currentRank = 1;
    let previousScore = null;
    let tiedUsers = 0;

    for (let i = 0; i < sortedUsers.length; i++) {
        const user = sortedUsers[i];
        const currentScore = `${user.completionPercentage}-${user.completedAchievements}`;

        if (previousScore === null || currentScore !== previousScore) {
            currentRank = i + 1;
            previousScore = currentScore;
            tiedUsers = 0;
        } else {
            tiedUsers++;
        }

        rankedUsers.push({
            ...user,
            rank: currentRank,
            isTied: tiedUsers > 0
        });
    }

    return rankedUsers;
}

module.exports = {
    displayMonthlyLeaderboard
};

// commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const DataService = require('../services/dataService');
const { monthlyGames } = require('../monthlyGames');

function formatDate(date) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    const suffix = ['th', 'st', 'nd', 'rd'][(day > 3 && day < 21) || day % 10 > 3 ? 0 : day % 10];
    return `${month} ${day}${suffix}, ${year} at ${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function getTimeRemaining(endDate) {
    const now = new Date();
    const timeLeft = endDate - now;
    
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
        return `${days} day${days !== 1 ? 's' : ''} and ${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
}

// Helper function to get the last day of the month
function getLastDayOfMonth(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// Helper function to get platform for shadow games
function getShadowGamePlatform(gameId) {
    const platformMap = {
        "8181": "Game Boy Advance", // Monster Rancher Advance 2
        "274": "SNES", // U.N. Squadron
        "10024": "N64" // Mario Tennis
    };
    
    return platformMap[gameId] || "RetroAchievements";
}

class LeaderboardCommand {
    constructor() {
        this.name = 'leaderboard';
        this.description = 'Display monthly or yearly leaderboards';
    }

    async execute(message, args, { shadowGame, pointsManager }) {
        try {
            if (!args.length) {
                const embed = new EmbedBuilder()
                    .setColor('#32CD32')
                    .setTitle('Leaderboard Options')
                    .setDescription('Select an option:')
                    .addFields({
                        name: 'Usage',
                        value: '1. `!leaderboard month` - View monthly challenge leaderboard\n' +
                               '2. `!leaderboard year` - View yearly challenge leaderboard'
                    })
                    .setFooter({ text: `Requested by ${message.author.username}` })
                    .setTimestamp();

                await message.channel.send({ embeds: [embed] });
                if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);
                return;
            }

            switch(args[0].toLowerCase()) {
                case 'month':
                    await this.displayMonthlyLeaderboard(message, shadowGame);
                    break;
                case 'year':
                    await this.displayYearlyLeaderboard(message, shadowGame, pointsManager);
                    break;
                default:
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setDescription('**Error:** Invalid option. Use `!leaderboard` to see available options.')
                        .setTimestamp();
                    await message.channel.send({ embeds: [errorEmbed] });
            }
        } catch (error) {
            console.error('Leaderboard Command Error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('**Error:** Failed to process leaderboard command.')
                .setTimestamp();
            await message.channel.send({ embeds: [errorEmbed] });
        }
    }

    async displayYearlyLeaderboard(message, shadowGame, pointsManager) {
        try {
            const validUsers = await DataService.getValidUsers();
            const year = new Date().getFullYear().toString();

            const userStats = await Promise.all(
                validUsers.map(async username => {
                    const yearlyPoints = await pointsManager.getUserPoints(username, year);
                    
                    // Process points by game
                    const gamePoints = new Map();
                    
                    for (const point of yearlyPoints) {
                        const gameId = point.gameId;
                        const type = point.reason.toLowerCase();
                        
                        if (!gamePoints.has(gameId)) {
                            gamePoints.set(gameId, {
                                participation: false,
                                beaten: false,
                                mastery: false,
                                points: 0
                            });
                        }
                        
                        const game = gamePoints.get(gameId);
                        
                        // Only count each type once per game
                        if (type.includes('participation') && !game.participation) {
                            game.participation = true;
                            game.points += 1;
                        }
                        if (type.includes('beaten') && !game.beaten) {
                            game.beaten = true;
                            game.points += 3;
                        }
                        if (type.includes('mastery') && !game.mastery) {
                            game.mastery = true;
                            game.points += 3;
                        }
                    }

                    // Calculate totals
                    const totals = {
                        totalPoints: 0,
                        gamesJoined: 0,
                        gamesBeaten: 0,
                        gamesMastered: 0
                    };

                    for (const game of gamePoints.values()) {
                        totals.totalPoints += game.points;
                        if (game.participation) totals.gamesJoined++;
                        if (game.beaten) totals.gamesBeaten++;
                        if (game.mastery) totals.gamesMastered++;
                    }

                    return {
                        username,
                        ...totals
                    };
                })
            );

            // Sort users by points and other criteria
            const rankedUsers = userStats
                .filter(user => user.totalPoints > 0)
                .sort((a, b) => {
                    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
                    if (a.gamesBeaten !== b.gamesBeaten) return b.gamesBeaten - a.gamesBeaten;
                    return b.gamesMastered - a.gamesMastered;
                })
                .map((user, index) => ({ ...user, rank: index + 1 }));

            const embed = new EmbedBuilder()
                .setColor('#32CD32')
                .setTitle('Yearly Rankings')
                .setDescription('Current year standings:');

            // Split rankings into chunks of 10 users for better display
            const chunks = [];
            for (let i = 0; i < rankedUsers.length; i += 10) {
                chunks.push(rankedUsers.slice(i, i + 10));
            }

            chunks.forEach((chunk, index) => {
                const fieldTitle = `Rankings ${index * 10 + 1}-${Math.min((index + 1) * 10, rankedUsers.length)}`;
                const fieldContent = chunk.map(user => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const medal = user.rank <= 3 ? medals[user.rank - 1] : '';
                    return `${medal} **#${user.rank} ${user.username}**: ${user.totalPoints} points\n` +
                           `Games: ${user.gamesJoined} joined, ${user.gamesBeaten} beaten, ${user.gamesMastered} mastered`;
                }).join('\n\n');

                embed.addFields({ name: fieldTitle, value: fieldContent });
            });

            if (rankedUsers.length === 0) {
                embed.addFields({ name: 'Status', value: 'No rankings available' });
            }

            embed.setFooter({ text: `Requested by ${message.author.username}` })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Yearly Leaderboard Error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('**Error:** Failed to retrieve yearly leaderboard.')
                .setTimestamp();
            await message.channel.send({ embeds: [errorEmbed] });
        }
    }

    async displayMonthlyLeaderboard(message, shadowGame) {
        try {
            // Get current date and format as YYYY-MM
            const today = new Date();
            const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            
            // Get current challenge
            let currentChallenge = await DataService.getCurrentChallenge();
            
            // Check if the challenge's month matches current month
            const challengeMonth = currentChallenge?.startDate?.substring(0, 7);
            
            // Variable to track if we updated the challenge
            let challengeUpdated = false;
            
            // If the months don't match and we have data for the current month, update it
            if (challengeMonth !== currentMonthKey && monthlyGames[currentMonthKey]) {
                // Log that we're updating the challenge
                console.log(`Leaderboard: Updating challenge from ${challengeMonth} to ${currentMonthKey}`);
                
                // Get the new monthly game data
                const gameData = monthlyGames[currentMonthKey].monthlyGame;
                
                // Create challenge data object for database
                const challengeData = {
                    gameId: gameData.id,
                    gameName: gameData.name,
                    gameIcon: `https://media.retroachievements.org/Images/056204.png`, // Use the correct Mega Man X5 image
                    startDate: `${currentMonthKey}-01`,
                    endDate: getLastDayOfMonth(today),
                    rules: [
                        `Complete ${gameData.requireProgression ? 'all' : 'any'} progression achievements`,
                        `Complete ${gameData.requireAllWinConditions ? 'all' : 'any'} win condition achievements`,
                        gameData.allowMastery ? 'Mastery available for additional points' : 'No mastery bonus available'
                    ]
                };
                
                // Save the new challenge to database
                await DataService.saveCurrentChallenge(challengeData);
                
                // Also update shadow game if it exists
                if (monthlyGames[currentMonthKey].shadowGame) {
                    const shadowData = monthlyGames[currentMonthKey].shadowGame;
                    await DataService.saveShadowGame({
                        active: true,
                        revealed: false, // Initially hidden
                        finalReward: {
                            gameId: shadowData.id,
                            gameName: shadowData.name,
                            platform: getShadowGamePlatform(shadowData.id),
                            points: 4 // Default points (1 for participation + 3 for completion)
                        }
                    });
                }
                
                // Get the updated challenge from database
                currentChallenge = await DataService.getCurrentChallenge();
                challengeUpdated = true;
            }

            // Force a refresh of the leaderboard cache if we updated the challenge
            let leaderboardData;
            if (challengeUpdated) {
                // Refresh the leaderboard data
                await DataService.refreshLeaderboardCache();
            }
            
            // Get the leaderboard data
            leaderboardData = await DataService.getLeaderboard('monthly');

            const validUsers = await DataService.getValidUsers();
            const activeUsers = leaderboardData.filter(user =>
                validUsers.includes(user.username.toLowerCase()) &&
                (user.completedAchievements > 0 || parseFloat(user.completionPercentage) > 0)
            );

            const rankedUsers = this.rankUsersByProgress(activeUsers);
            
            const endOfMonth = new Date();
            endOfMonth.setMonth(endOfMonth.getMonth() + 1);
            endOfMonth.setDate(0);
            endOfMonth.setHours(23, 59, 59, 999);

            const monthName = new Date().toLocaleString('default', { month: 'long' });
            const timeRemaining = getTimeRemaining(endOfMonth);

            const embed = new EmbedBuilder()
                .setColor('#32CD32')
                .setTitle(`${monthName} Challenge Leaderboard`)
                .setThumbnail(`https://media.retroachievements.org/Images/056204.png`)
                .setDescription(`**Game**: ${currentChallenge?.gameName || 'Unknown'}\n` +
                               `**Total Achievements**: ${activeUsers[0]?.totalAchievements || 0}\n` +
                               `**Challenge Ends**: ${formatDate(endOfMonth)}\n` +
                               `**Time Remaining**: ${timeRemaining}`);

            // Split users into chunks of 10 for better display
            const chunks = [];
            for (let i = 0; i < rankedUsers.length; i += 10) {
                chunks.push(rankedUsers.slice(i, i + 10));
            }

            chunks.forEach((chunk, index) => {
                const startRank = index * 10 + 1;
                const endRank = Math.min((index + 1) * 10, rankedUsers.length);
                
                const fieldContent = chunk.map(user => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const medal = user.rank <= 3 ? medals[user.rank - 1] : '';
                    return `${medal} **#${user.rank} ${user.username}**\n` +
                           `${user.completedAchievements}/${user.totalAchievements} (${user.completionPercentage}%)`;
                }).join('\n\n');

                embed.addFields({ name: `Rankings ${startRank}-${endRank}`, value: fieldContent });
            });

            if (activeUsers.length === 0) {
                embed.addFields({ name: 'Status', value: 'No active participants yet' });
            }

            embed.setFooter({ text: `Requested by ${message.author.username}` })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Monthly Leaderboard Error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('**Error:** Failed to retrieve monthly leaderboard.')
                .setTimestamp();
            await message.channel.send({ embeds: [errorEmbed] });
        }
    }

    rankUsersByProgress(users) {
        return users
            .sort((a, b) => {
                const percentDiff = parseFloat(b.completionPercentage) - parseFloat(a.completionPercentage);
                if (percentDiff !== 0) return percentDiff;
                return b.completedAchievements - a.completedAchievements;
            })
            .map((user, index) => ({
                ...user,
                rank: index + 1,
                displayInMain: index < 3
            }));
    }
}

module.exports = new LeaderboardCommand();

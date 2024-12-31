const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const database = require('./database');

class UserStats {
    constructor() {
        this.stats = {
            users: {},
            yearlyStats: {},
            monthlyStats: {},
            gameCompletions: {},
            achievementStats: {},
            communityRecords: {}
        };
        this.currentYear = new Date().getFullYear();
        this.SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRt6MiNALBT6jj0hG5qtalI_GkSkXFaQvWdRj-Ye-l3YNU4DB5mLUQGHbLF9-XnhkpJjLEN9gvTHXmp/pub?gid=0&single=true&output=csv';
    }

    async loadStats() {
        try {
            // Load stats from MongoDB
            const dbStats = await database.getUserStats();
            
            // Merge with default structure
            this.stats = {
                users: dbStats.users || {},
                yearlyStats: dbStats.yearlyStats || {},
                monthlyStats: dbStats.monthlyStats || {},
                gameCompletions: dbStats.gameCompletions || {},
                achievementStats: dbStats.achievementStats || {},
                communityRecords: dbStats.communityRecords || {}
            };
            
            // Fetch and sync users from spreadsheet
            const response = await fetch(this.SPREADSHEET_URL);
            const csvText = await response.text();
            
            const users = csvText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .slice(1);

            console.log('Found users:', users);

            for (const username of users) {
                await this.initializeUserIfNeeded(username);
            }

            await this.saveStats();
            console.log('Stats loaded and synchronized with spreadsheet');
            
        } catch (error) {
            console.error('Error loading or synchronizing stats:', error);
            throw error;
        }
    }

    async initializeUserIfNeeded(username) {
        if (!username) return;

        const cleanUsername = username.trim().toLowerCase();
        if (!cleanUsername) return;

        const year = this.currentYear.toString();
        
        // Initialize user if they don't exist
        if (!this.stats.users[cleanUsername]) {
            this.stats.users[cleanUsername] = {
                totalPoints: 0,
                yearlyPoints: {},
                monthlyAchievements: {},
                bonusPoints: [],
                completedGames: {},
                monthlyStats: {},
                yearlyStats: {},
                achievements: {
                    titles: [],
                    badges: [],
                    milestones: [],
                    specialUnlocks: [],
                    records: [],
                    streaks: {
                        current: 0,
                        longest: 0,
                        lastUpdate: null
                    }
                }
            };
        }

        const userStats = this.stats.users[cleanUsername];

        // Initialize year structures
        if (!userStats.yearlyPoints[year]) {
            userStats.yearlyPoints[year] = 0;
        }

        if (!userStats.completedGames[year]) {
            userStats.completedGames[year] = [];
        }

        if (!userStats.monthlyStats[year]) {
            userStats.monthlyStats[year] = {};
        }

        if (!userStats.yearlyStats[year]) {
            userStats.yearlyStats[year] = {
                totalGamesCompleted: 0,
                totalAchievementsUnlocked: 0,
                hardcoreCompletions: 0,
                softcoreCompletions: 0,
                monthlyParticipations: 0,
                perfectMonths: 0,
                totalPoints: 0,
                averageCompletion: 0,
                longestStreak: 0,
                currentStreak: 0,
                highestSingleDay: 0,
                mastery100Count: 0,
                participationRate: 0,
                rareAchievements: 0,
                personalBests: {
                    fastestCompletion: null,
                    highestPoints: 0,
                    bestRank: 0
                },
                achievementsPerMonth: {},
                dailyActivity: {},
                hardestGame: ""
            };
        }

        if (!userStats.monthlyAchievements[year]) {
            userStats.monthlyAchievements[year] = {};
        }

        await this.saveStats();
    }

    async saveStats() {
        try {
            await database.saveUserStats(this.stats);
        } catch (error) {
            console.error('Error saving stats to database:', error);
            throw error;
        }
    }
    // Add these methods to the UserStats class

    async updateAchievementProgress(username, gameId, achievementData) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            const year = this.currentYear.toString();
            const month = new Date().toLocaleString('default', { month: 'long' });
            const today = new Date().toISOString().split('T')[0];
            
            const userStats = this.stats.users[cleanUsername];
            if (!userStats) return;

            // Initialize daily tracking if needed
            if (!userStats.yearlyStats[year].dailyActivity[today]) {
                userStats.yearlyStats[year].dailyActivity[today] = {
                    achievements: 0,
                    points: 0,
                    games: new Set()
                };
            }

            // Update daily stats
            userStats.yearlyStats[year].dailyActivity[today].achievements++;
            userStats.yearlyStats[year].dailyActivity[today].games.add(gameId);

            // Update monthly tracking
            if (!userStats.monthlyStats[year][month]) {
                userStats.monthlyStats[year][month] = {
                    dailyProgress: {},
                    achievementsByDay: {},
                    timeToComplete: 0,
                    peakPosition: 0,
                    totalPlaytime: 0,
                    firstUnlock: null,
                    lastUnlock: null,
                    progressHistory: []
                };
            }

            const monthlyStats = userStats.monthlyStats[year][month];
            
            // Track first and last unlocks
            if (!monthlyStats.firstUnlock) {
                monthlyStats.firstUnlock = new Date().toISOString();
            }
            monthlyStats.lastUnlock = new Date().toISOString();

            // Update achievement tracking
            if (!monthlyStats.achievementsByDay[today]) {
                monthlyStats.achievementsByDay[today] = [];
            }
            monthlyStats.achievementsByDay[today].push(achievementData);

            // Update streak information
            await this.updateStreaks(cleanUsername);

            // Update records
            if (achievementData.rarity < 5) { // Rare achievement (less than 5% global unlock rate)
                userStats.yearlyStats[year].rareAchievements++;
            }

            // Update highest single day count if needed
            const todayCount = userStats.yearlyStats[year].dailyActivity[today].achievements;
            if (todayCount > userStats.yearlyStats[year].highestSingleDay) {
                userStats.yearlyStats[year].highestSingleDay = todayCount;
            }

            await this.saveStats();
        } catch (error) {
            console.error('Error updating achievement progress:', error);
            throw error;
        }
    }

    async updateStreaks(username) {
        try {
            const userStats = this.stats.users[username];
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            // Initialize streaks if needed
            if (!userStats.achievements.streaks) {
                userStats.achievements.streaks = {
                    current: 0,
                    longest: 0,
                    lastUpdate: null
                };
            }

            const streaks = userStats.achievements.streaks;

            // Check if achievement was earned today
            if (streaks.lastUpdate === today) {
                return; // Already updated today
            }

            // Check if achievement was earned yesterday
            if (streaks.lastUpdate === yesterday) {
                streaks.current++;
                if (streaks.current > streaks.longest) {
                    streaks.longest = streaks.current;
                }
            } else if (streaks.lastUpdate !== today) {
                // Streak broken
                streaks.current = 1;
            }

            streaks.lastUpdate = today;
            
            // Update yearly stats
            const year = this.currentYear.toString();
            if (streaks.current > userStats.yearlyStats[year].longestStreak) {
                userStats.yearlyStats[year].longestStreak = streaks.current;
            }
            userStats.yearlyStats[year].currentStreak = streaks.current;

            await this.saveStats();
        } catch (error) {
            console.error('Error updating streaks:', error);
            throw error;
        }
    }

    async calculatePerformanceMetrics(username, month, year) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            const userStats = this.stats.users[cleanUsername];
            if (!userStats) return null;

            const monthlyStats = userStats.monthlyStats[year]?.[month];
            if (!monthlyStats) return null;

            // Calculate days active
            const daysActive = Object.keys(monthlyStats.achievementsByDay).length;

            // Calculate metrics
            const metrics = {
                consistencyScore: 0,
                efficiencyRate: 0,
                competitiveIndex: 0,
                growthRate: 0,
                challengeWinRate: 0
            };

            // Consistency Score (0-100)
            const totalDaysInMonth = new Date(year, new Date(month + ' 1').getMonth() + 1, 0).getDate();
            metrics.consistencyScore = (daysActive / totalDaysInMonth) * 100;

            // Efficiency Rate (points per active day)
            metrics.efficiencyRate = monthlyStats.totalPoints / daysActive;

            // Challenge Win Rate
            const monthlyAchievements = userStats.monthlyAchievements[year] || {};
            const totalChallenges = Object.keys(monthlyAchievements).length;
            const podiumFinishes = Object.values(monthlyAchievements)
                .filter(a => ['first', 'second', 'third'].includes(a.place)).length;
            metrics.challengeWinRate = totalChallenges > 0 ? (podiumFinishes / totalChallenges) * 100 : 0;

            return metrics;
        } catch (error) {
            console.error('Error calculating performance metrics:', error);
            throw error;
        }
    }

    async updatePersonalBests(username, gameId, completionData) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            const year = this.currentYear.toString();
            const userStats = this.stats.users[cleanUsername];
            
            if (!userStats?.yearlyStats[year]?.personalBests) return;

            const personalBests = userStats.yearlyStats[year].personalBests;

            // Update fastest completion if applicable
            if (!personalBests.fastestCompletion || 
                completionData.timeToComplete < personalBests.fastestCompletion.time) {
                personalBests.fastestCompletion = {
                    gameId,
                    time: completionData.timeToComplete,
                    date: new Date().toISOString()
                };
            }

            // Update highest points if applicable
            const currentMonthPoints = completionData.points;
            if (currentMonthPoints > personalBests.highestPoints) {
                personalBests.highestPoints = currentMonthPoints;
            }

            // Update best rank if applicable
            if (!personalBests.bestRank || completionData.rank < personalBests.bestRank) {
                personalBests.bestRank = completionData.rank;
            }

            await this.saveStats();
        } catch (error) {
            console.error('Error updating personal bests:', error);
            throw error;
        }
    }

   // Add these methods to the UserStats class

    async updateCommunityRecords(gameData) {
        try {
            const year = this.currentYear.toString();
            if (!this.stats.communityRecords) {
                this.stats.communityRecords = {
                    fastestCompletions: {},
                    highestScores: {},
                    monthlyRecords: {
                        highestParticipation: 0,
                        mostCompetitive: "",
                        highestAverageCompletion: 0
                    },
                    yearlyRecords: {
                        [year]: {
                            mostAchievements: { user: "", count: 0 },
                            fastestCompletion: { user: "", game: "", time: 0 },
                            highestPoints: { user: "", points: 0 }
                        }
                    },
                    milestones: [],
                    hallOfFame: {
                        perfectMonths: [],
                        speedrunners: [],
                        completionists: []
                    }
                };
            }

            // Update fastest completions if applicable
            if (!this.stats.communityRecords.fastestCompletions[gameData.gameId] ||
                gameData.completionTime < this.stats.communityRecords.fastestCompletions[gameData.gameId].time) {
                this.stats.communityRecords.fastestCompletions[gameData.gameId] = {
                    user: gameData.username,
                    time: gameData.completionTime,
                    date: new Date().toISOString()
                };
            }

            // Update hall of fame if needed
            if (gameData.isSpeedrun) {
                const speedrunEntry = {
                    user: gameData.username,
                    game: gameData.gameName,
                    time: gameData.completionTime,
                    date: new Date().toISOString()
                };
                this.stats.communityRecords.hallOfFame.speedrunners.push(speedrunEntry);
                this.stats.communityRecords.hallOfFame.speedrunners.sort((a, b) => a.time - b.time);
            }

            await this.saveStats();
        } catch (error) {
            console.error('Error updating community records:', error);
            throw error;
        }
    }

    async checkAndAwardTitles(username) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            const userStats = this.stats.users[cleanUsername];
            const year = this.currentYear.toString();

            if (!userStats) return;

            const config = await database.getConfiguration();
            const titles = config.achievements.titles;

            // Check each title's requirements
            for (const [titleName, titleData] of Object.entries(titles)) {
                if (!userStats.achievements.titles.includes(titleName)) {
                    const meetsRequirement = await this.checkTitleRequirement(userStats, titleData.requirement);
                    if (meetsRequirement) {
                        userStats.achievements.titles.push(titleName);
                        await this.addBonusPoints(username, 2, `Title Earned: ${titleName}`);
                    }
                }
            }

            await this.saveStats();
        } catch (error) {
            console.error('Error checking and awarding titles:', error);
            throw error;
        }
    }

    async checkTitleRequirement(userStats, requirement) {
        const year = this.currentYear.toString();

        // Example requirements
        if (requirement === "Complete 3 games in under 24 hours") {
            const gamesCompleted = userStats.completedGames[year] || [];
            let quickCompletions = 0;
            
            for (const game of gamesCompleted) {
                const completionTime = new Date(game.completionDate) - new Date(game.firstPlayed);
                if (completionTime < 24 * 60 * 60 * 1000) { // 24 hours in milliseconds
                    quickCompletions++;
                }
            }
            
            return quickCompletions >= 3;
        }
        
        if (requirement === "100% complete 5 games") {
            const perfectGames = userStats.yearlyStats[year].mastery100Count || 0;
            return perfectGames >= 5;
        }

        if (requirement === "Place in top 3 for 3 months") {
            const monthlyAchievements = userStats.monthlyAchievements[year] || {};
            const podiumFinishes = Object.values(monthlyAchievements)
                .filter(a => ['first', 'second', 'third'].includes(a.place)).length;
            return podiumFinishes >= 3;
        }

        return false;
    }

    async updateMilestones(username) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            const userStats = this.stats.users[cleanUsername];
            const year = this.currentYear.toString();

            if (!userStats) return;

            const milestones = [
                { name: "First Achievement", requirement: 1 },
                { name: "Achievement Hunter", requirement: 100 },
                { name: "Master Achiever", requirement: 500 },
                { name: "Legend", requirement: 1000 }
            ];

            const totalAchievements = userStats.yearlyStats[year].totalAchievementsUnlocked;

            for (const milestone of milestones) {
                if (!userStats.achievements.milestones.includes(milestone.name) &&
                    totalAchievements >= milestone.requirement) {
                    userStats.achievements.milestones.push(milestone.name);
                    await this.addBonusPoints(username, 3, `Milestone Reached: ${milestone.name}`);
                }
            }

            await this.saveStats();
        } catch (error) {
            console.error('Error updating milestones:', error);
            throw error;
        }
    }

    async updateSpecialUnlocks(username, achievementData) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            const userStats = this.stats.users[cleanUsername];

            if (!userStats) return;

            // Check for special unlocks (rare achievements, first unlocks, etc.)
            if (achievementData.rarity < 1) { // Ultra rare (less than 1% global unlock rate)
                const specialUnlock = {
                    type: "Ultra Rare",
                    achievement: achievementData.name,
                    game: achievementData.gameName,
                    date: new Date().toISOString()
                };
                userStats.achievements.specialUnlocks.push(specialUnlock);
                await this.addBonusPoints(username, 1, `Ultra Rare Achievement: ${achievementData.name}`);
            }

            // First unlock in community
            if (achievementData.isFirstUnlock) {
                const specialUnlock = {
                    type: "First Unlock",
                    achievement: achievementData.name,
                    game: achievementData.gameName,
                    date: new Date().toISOString()
                };
                userStats.achievements.specialUnlocks.push(specialUnlock);
                await this.addBonusPoints(username, 1, `First Community Unlock: ${achievementData.name}`);
            }

            await this.saveStats();
        } catch (error) {
            console.error('Error updating special unlocks:', error);
            throw error;
        }
    }
    async getYearlyLeaderboard(year = null) {
    try {
        const targetYear = year || this.currentYear.toString();

        // Ensure users data is refreshed and up-to-date
        await this.refreshUserList();

        // Map users to leaderboard entries
        const leaderboard = Object.entries(this.stats.users).map(([username, stats]) => ({
            username,
            points: stats.yearlyPoints[targetYear] || 0,
            gamesCompleted: stats.yearlyStats?.[targetYear]?.totalGamesCompleted || 0,
            achievementsUnlocked: stats.yearlyStats?.[targetYear]?.totalAchievementsUnlocked || 0,
            monthlyParticipations: stats.yearlyStats?.[targetYear]?.monthlyParticipations || 0,
        }));

        // Sort by points, then by games completed as a tiebreaker
        return leaderboard.sort((a, b) => 
            b.points - a.points || b.gamesCompleted - a.gamesCompleted
        );
    } catch (error) {
        console.error('Error in getYearlyLeaderboard:', error);
        throw error;
    }
}

}

module.exports = UserStats;

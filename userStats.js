const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const database = require('./database');

class UserStats {
    constructor() {
        this.stats = null;
        this.currentYear = new Date().getFullYear();
        this.SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRt6MiNALBT6jj0hG5qtalI_GkSkXFaQvWdRj-Ye-l3YNU4DB5mLUQGHbLF9-XnhkpJjLEN9gvTHXmp/pub?gid=0&single=true&output=csv';
    }

    async loadStats() {
        try {
            // Load stats from MongoDB
            this.stats = await database.getUserStats();
            
            // Fetch and sync users from spreadsheet
            const response = await fetch(this.SPREADSHEET_URL);
            const csvText = await response.text();
            
            const users = csvText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .slice(1);

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

    async saveStats() {
        await database.saveUserStats(this.stats);
    }

    async initializeUserIfNeeded(username) {
        if (!username) return;

        const cleanUsername = username.trim().toLowerCase();
        if (!cleanUsername) return;

        const existingUser = Object.keys(this.stats.users)
            .find(user => user.toLowerCase() === cleanUsername);

        if (!existingUser) {
            this.stats.users[cleanUsername] = {
                totalPoints: 0,
                yearlyPoints: {},
                monthlyAchievements: {},
                bonusPoints: [],
                completedGames: {},
                monthlyStats: {},
                yearlyStats: {},
                currentChallenges: {
                    monthly: null,
                    special: []
                }
            };
        }

        const year = this.currentYear.toString();
        const actualUsername = existingUser || cleanUsername;

        // Initialize yearly points if needed
        if (!this.stats.users[actualUsername].yearlyPoints[year]) {
            this.stats.users[actualUsername].yearlyPoints[year] = 0;
        }

        // Initialize completed games tracking if needed
        if (!this.stats.users[actualUsername].completedGames[year]) {
            this.stats.users[actualUsername].completedGames[year] = [];
        }

        // Initialize monthly stats if needed
        if (!this.stats.users[actualUsername].monthlyStats[year]) {
            this.stats.users[actualUsername].monthlyStats[year] = {};
        }

        // Initialize yearly stats if needed
        if (!this.stats.users[actualUsername].yearlyStats[year]) {
            this.stats.users[actualUsername].yearlyStats[year] = {
                totalGamesCompleted: 0,
                totalAchievementsUnlocked: 0,
                hardcoreCompletions: 0,
                softcoreCompletions: 0,
                monthlyParticipations: 0,
                perfectMonths: 0
            };
        }

        await this.saveStats();
    }

    async refreshUserList() {
        try {
            const response = await fetch(this.SPREADSHEET_URL);
            const csvText = await response.text();
            
            const users = csvText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .slice(1);

            for (const username of users) {
                await this.initializeUserIfNeeded(username);
            }

            await this.saveStats();
            return users;
        } catch (error) {
            console.error('Error refreshing user list:', error);
            throw error;
        }
    }

    async archiveLeaderboard(data) {
        try {
            const date = new Date();
            const month = date.toLocaleString('default', { month: 'long' });
            const year = date.getFullYear().toString();

            if (!this.stats.monthlyStats) {
                this.stats.monthlyStats = {};
            }
            if (!this.stats.monthlyStats[year]) {
                this.stats.monthlyStats[year] = {};
            }

            this.stats.monthlyStats[year][month] = {
                archivedDate: date.toISOString(),
                gameInfo: data.gameInfo,
                leaderboard: data.leaderboard
            };

            await this.saveStats();
            
            return {
                month,
                year,
                rankings: data.leaderboard
            };
        } catch (error) {
            console.error('Error archiving leaderboard:', error);
            throw error;
        }
    }

    async addMonthlyPoints(month, year, rankings) {
        await this.refreshUserList();
        
        const pointsDistribution = { first: 6, second: 4, third: 2 };
        
        for (const [place, username] of Object.entries(rankings)) {
            if (username) {
                const actualUsername = Object.keys(this.stats.users)
                    .find(user => user.toLowerCase() === username.toLowerCase());
                
                if (!actualUsername) {
                    await this.initializeUserIfNeeded(username);
                }

                const userToUpdate = actualUsername || username;
                const points = pointsDistribution[place];

                // Update user stats
                if (!this.stats.users[userToUpdate]) {
                    this.stats.users[userToUpdate] = {
                        totalPoints: 0,
                        yearlyPoints: { [year]: 0 },
                        monthlyAchievements: {},
                        bonusPoints: [],
                        completedGames: {},
                        monthlyStats: {},
                        yearlyStats: {}
                    };
                }

                // Update points
                this.stats.users[userToUpdate].totalPoints += points;
                if (!this.stats.users[userToUpdate].yearlyPoints[year]) {
                    this.stats.users[userToUpdate].yearlyPoints[year] = 0;
                }
                this.stats.users[userToUpdate].yearlyPoints[year] += points;
                
                // Record monthly achievement
                if (!this.stats.users[userToUpdate].monthlyAchievements[year]) {
                    this.stats.users[userToUpdate].monthlyAchievements[year] = {};
                }
                this.stats.users[userToUpdate].monthlyAchievements[year][month] = {
                    place,
                    points,
                    date: new Date().toISOString()
                };

                // Update monthly stats
                if (!this.stats.users[userToUpdate].monthlyStats[year]) {
                    this.stats.users[userToUpdate].monthlyStats[year] = {};
                }
                if (!this.stats.users[userToUpdate].monthlyStats[year][month]) {
                    this.stats.users[userToUpdate].monthlyStats[year][month] = {
                        achievementsUnlocked: 0,
                        gamesCompleted: 0,
                        hardcoreCompletions: 0,
                        totalPoints: 0
                    };
                }
                this.stats.users[userToUpdate].monthlyStats[year][month].totalPoints += points;

                // Update yearly stats
                if (!this.stats.users[userToUpdate].yearlyStats[year]) {
                    this.stats.users[userToUpdate].yearlyStats[year] = {
                        totalGamesCompleted: 0,
                        totalAchievementsUnlocked: 0,
                        hardcoreCompletions: 0,
                        monthlyParticipations: 0,
                        perfectMonths: 0
                    };
                }
                this.stats.users[userToUpdate].yearlyStats[year].monthlyParticipations++;
            }
        }

        await this.saveStats();
    }

    async addBonusPoints(username, points, reason) {
        try {
            console.log('Starting bonus points addition for:', username);
            await this.refreshUserList();
            
            const actualUsername = Object.keys(this.stats.users)
                .find(user => user.toLowerCase() === username.toLowerCase());
            
            console.log('Found actual username:', actualUsername);
            
            if (!actualUsername) {
                console.log('Username not found, initializing:', username);
                await this.initializeUserIfNeeded(username);
            }

            const userToUpdate = actualUsername || username;
            console.log('User to update:', userToUpdate);
            
            const year = this.currentYear.toString();
            
            // Initialize user if needed
            if (!this.stats.users[userToUpdate]) {
                console.log('Creating new user entry for:', userToUpdate);
                this.stats.users[userToUpdate] = {
                    totalPoints: 0,
                    yearlyPoints: { [year]: 0 },
                    monthlyAchievements: {},
                    bonusPoints: [],
                    completedGames: {},
                    monthlyStats: {},
                    yearlyStats: {}
                };
            }
            
            // Update points
            this.stats.users[userToUpdate].totalPoints += points;
            if (!this.stats.users[userToUpdate].yearlyPoints[year]) {
                this.stats.users[userToUpdate].yearlyPoints[year] = 0;
            }
            this.stats.users[userToUpdate].yearlyPoints[year] += points;
            
            // Record bonus points
            if (!this.stats.users[userToUpdate].bonusPoints) {
                this.stats.users[userToUpdate].bonusPoints = [];
            }
            
            this.stats.users[userToUpdate].bonusPoints.push({
                points,
                reason,
                date: new Date().toISOString(),
                year
            });

            await this.saveStats();
            console.log('Successfully added points to:', userToUpdate);
        } catch (error) {
            console.error('Error in addBonusPoints for user', username, ':', error);
            throw error;
        }
    }

    async checkGameCompletion(username, gameId) {
        try {
            const params = new URLSearchParams({
                z: process.env.RA_USERNAME,
                y: process.env.RA_API_KEY,
                g: gameId,
                u: username
            });

            const url = `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?${params}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            const numAchievements = data.Achievements ? Object.keys(data.Achievements).length : 0;
            const completed = data.Achievements ? 
                Object.values(data.Achievements).filter(ach => parseInt(ach.DateEarned) > 0).length : 0;

            if (completed === numAchievements && numAchievements > 0) {
                const latestDate = Object.values(data.Achievements)
                    .map(ach => ach.DateEarned)
                    .sort()
                    .pop();

                const completionDate = new Date(parseInt(latestDate) * 1000);
                const startDate = new Date('2024-01-01');

                if (completionDate >= startDate) {
                    const year = completionDate.getFullYear().toString();
                    const alreadyCompleted = this.stats.users[username]?.completedGames[year]?.some(
                        game => game.gameId === gameId
                    );

                    if (!alreadyCompleted) {
                        await this.recordGameCompletion(username, {
                            gameId,
                            gameName: data.Title,
                            completionDate: completionDate.toISOString(),
                            achievements: {
                                total: numAchievements,
                                completed
                            }
                        });

                        return {
                            completed: true,
                            newCompletion: true,
                            game: data.Title,
                            date: completionDate
                        };
                    }
                }
            }

            return {
                completed: completed === numAchievements,
                newCompletion: false
            };

        } catch (error) {
            console.error('Error checking game completion:', error);
            throw error;
        }
    }

    async recordGameCompletion(username, gameData) {
        try {
            const year = new Date(gameData.completionDate).getFullYear().toString();
            const month = new Date(gameData.completionDate).toLocaleString('default', { month: 'long' });

            // Initialize structures if needed
            if (!this.stats.users[username].completedGames[year]) {
                this.stats.users[username].completedGames[year] = [];
            }

            // Record completion
            this.stats.users[username].completedGames[year].push(gameData);

            // Update monthly stats
            if (!this.stats.users[username].monthlyStats[year][month]) {
                this.stats.users[username].monthlyStats[year][month] = {
                    achievementsUnlocked: 0,
                    gamesCompleted: 0,
                    hardcoreCompletions: 0,
                    totalPoints: 0
                };
            }
            this.stats.users[username].monthlyStats[year][month].gamesCompleted++;

            // Update yearly stats
            this.stats.users[username].yearlyStats[year].totalGamesCompleted++;
            this.stats.users[username].yearlyStats[year].totalAchievementsUnlocked += gameData.achievements.total;
            
            // Award completion point
            await this.addBonusPoints(username, 1, `Game Completion: ${gameData.gameName}`);

            await this.saveStats();
        } catch (error) {
            console.error('Error recording game completion:', error);
            throw error;
        }
    }

    async getUserStats(username) {
        try {
            console.log('Getting stats for user:', username);
            await this.refreshUserList();
            console.log('User list refreshed');

            const actualUsername = Object.keys(this.stats.users)
                .find(user => user.toLowerCase() === username.toLowerCase());

            if (!actualUsername) {
                await this.initializeUserIfNeeded(username);
                return {
                    username,
                    ...this.stats.users[username]
                };
            }

            return {
                username: actualUsername,
                ...this.stats.users[actualUsername]
            };
        } catch (error) {
            console.error('Error in getUserStats:', error);
            throw error;
        }
    }

    async getYearlyLeaderboard(year = null) {
        await this.refreshUserList();
        
        const targetYear = year || this.currentYear.toString();
        
        const leaderboard = Object.entries(this.stats.users)
          .map(([username, stats]) => ({
                username,
                points: stats.yearlyPoints[targetYear] || 0,
                gamesCompleted: stats.yearlyStats?.[targetYear]?.totalGamesCompleted || 0,
                achievementsUnlocked: stats.yearlyStats?.[targetYear]?.totalAchievementsUnlocked || 0,
                monthlyParticipations: stats.yearlyStats?.[targetYear]?.monthlyParticipations || 0
            }))
            .sort((a, b) => b.points - a.points || b.gamesCompleted - a.gamesCompleted);

        return leaderboard;
    }

    async resetUserPoints(username) {
        try {
            const actualUsername = Object.keys(this.stats.users)
                .find(user => user.toLowerCase() === username.toLowerCase());

            if (!actualUsername) {
                await this.initializeUserIfNeeded(username);
            }

            const userToUpdate = actualUsername || username;
            const currentYear = new Date().getFullYear().toString();
            
            this.stats.users[userToUpdate] = {
                totalPoints: 0,
                yearlyPoints: {
                    [currentYear]: 0
                },
                monthlyAchievements: {},
                bonusPoints: [],
                completedGames: {
                    [currentYear]: []
                },
                monthlyStats: {
                    [currentYear]: {}
                },
                yearlyStats: {
                    [currentYear]: {
                        totalGamesCompleted: 0,
                        totalAchievementsUnlocked: 0,
                        hardcoreCompletions: 0,
                        softcoreCompletions: 0,
                        monthlyParticipations: 0,
                        perfectMonths: 0
                    }
                },
                currentChallenges: {
                    monthly: null,
                    special: []
                }
            };

            await this.saveStats();
            return true;
        } catch (error) {
            console.error('Error resetting user points:', error);
            throw error;
        }
    }

    async getAllUsers() {
        await this.refreshUserList();
        return Object.keys(this.stats.users).map(user => user.toLowerCase());
    }

    async getMonthlyStats(month, year) {
        try {
            return this.stats.monthlyStats?.[year]?.[month] || null;
        } catch (error) {
            console.error('Error getting monthly stats:', error);
            throw error;
        }
    }

    async updateMonthlyStat(username, year, month, stat, value) {
        try {
            if (!this.stats.users[username].monthlyStats[year]) {
                this.stats.users[username].monthlyStats[year] = {};
            }
            if (!this.stats.users[username].monthlyStats[year][month]) {
                this.stats.users[username].monthlyStats[year][month] = {
                    achievementsUnlocked: 0,
                    gamesCompleted: 0,
                    hardcoreCompletions: 0,
                    totalPoints: 0
                };
            }
            
            this.stats.users[username].monthlyStats[year][month][stat] = value;
            await this.saveStats();
        } catch (error) {
            console.error('Error updating monthly stat:', error);
            throw error;
        }
    }

    async getCompletedGames(username, year = null) {
        try {
            const targetYear = year || this.currentYear.toString();
            return this.stats.users[username]?.completedGames[targetYear] || [];
        } catch (error) {
            console.error('Error getting completed games:', error);
            throw error;
        }
    }
}

module.exports = UserStats;

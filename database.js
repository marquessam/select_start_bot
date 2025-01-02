const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
    }

    async connect() {
        try {
            if (!process.env.MONGODB_URI) {
                throw new Error('MONGODB_URI environment variable is not defined');
            }

            this.client = new MongoClient(process.env.MONGODB_URI, {
                maxPoolSize: 10
            });
            
            await this.client.connect();
            this.db = this.client.db('selectstart');
            console.log('Connected to MongoDB');

            this.client.on('error', (error) => {
                console.error('MongoDB connection error:', error);
                this.reconnect();
            });

        } catch (error) {
            console.error('MongoDB connection error:', error);
            throw error;
        }
    }

    async reconnect() {
        console.log('Attempting to reconnect to MongoDB...');
        try {
            await this.disconnect();
            await this.connect();
        } catch (error) {
            console.error('Failed to reconnect:', error);
            setTimeout(() => this.reconnect(), 5000);
        }
    }

    async disconnect() {
        try {
            if (this.client) {
                await this.client.close();
                this.client = null;
                this.db = null;
                console.log('Disconnected from MongoDB');
            }
        } catch (error) {
            console.error('Error disconnecting from MongoDB:', error);
            throw error;
        }
    }

    async getUserStats() {
        const collection = this.db.collection('userstats');
        const stats = await collection.findOne({ _id: 'stats' });
        const year = new Date().getFullYear().toString();

        return stats || {
            users: {},
            yearlyStats: {
                [year]: {
                    communityAchievements: 0,
                    totalParticipants: 0,
                    averageCompletion: 0,
                    monthlyStats: {}
                }
            },
            monthlyStats: {},
            gameCompletions: {},
            achievementStats: {},
            communityRecords: {
                fastestCompletions: {},
                highestScores: {},
                monthlyRecords: {
                    highestParticipation: 0,
                    mostCompetitive: "",
                    highestAverageCompletion: 0
                },
                milestones: [],
                hallOfFame: {
                    perfectMonths: [],
                    speedrunners: [],
                    completionists: []
                }
            }
        };
    }

    async saveUserStats(stats) {
        const collection = this.db.collection('userstats');
        await collection.updateOne(
            { _id: 'stats' },
            { $set: stats },
            { upsert: true }
        );
    }

    async getCommunityRecords() {
        const collection = this.db.collection('records');
        const records = await collection.findOne({ _id: 'records' });
        const year = new Date().getFullYear().toString();

        return records || {
            fastestCompletions: {},
            highestScores: {},
            monthlyRecords: {
                highestParticipation: 0,
                mostCompetitive: "",
                highestAverageCompletion: 0
            },
            yearlyRecords: {
                [year]: {
                    mostAchievements: {
                        user: "",
                        count: 0
                    },
                    fastestCompletion: {
                        user: "",
                        game: "",
                        time: 0
                    },
                    highestPoints: {
                        user: "",
                        points: 0
                    }
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

    async saveCommunityRecords(records) {
        const collection = this.db.collection('records');
        await collection.updateOne(
            { _id: 'records' },
            { $set: records },
            { upsert: true }
        );
    }

    async getCurrentChallenge() {
        try {
            const collection = this.db.collection('challenges');
            const challenge = await collection.findOne({ _id: 'current' });
            return challenge || {
                gameId: "",
                gameName: "",
                gameIcon: "",
                startDate: "",
                endDate: "",
                rules: [
                    "Hardcore mode must be enabled",
                    "All achievements are eligible",
                    "Progress tracked via retroachievements",
                    "No hacks/save states/cheats allowed"
                ],
                points: {
                    first: 6,
                    second: 4,
                    third: 2
                },
                stats: {
                    participants: 0,
                    totalAchievements: 0,
                    averageCompletion: 0,
                    startDate: null,
                    lastUpdate: null,
                    dailyStats: {},
                    leaderboardHistory: []
                }
            };
        } catch (error) {
            console.error('Error getting current challenge:', error);
            throw error;
        }
    }

    async saveCurrentChallenge(challenge) {
        const collection = this.db.collection('challenges');
        await collection.updateOne(
            { _id: 'current' },
            { $set: challenge },
            { upsert: true }
        );
    }

    async getNextChallenge() {
        const collection = this.db.collection('challenges');
        const challenge = await collection.findOne({ _id: 'next' });
        return challenge || null;
    }

    async saveNextChallenge(challenge) {
        const collection = this.db.collection('challenges');
        await collection.updateOne(
            { _id: 'next' },
            { $set: challenge },
            { upsert: true }
        );
    }

    async getConfiguration() {
        const collection = this.db.collection('config');
        const config = await collection.findOne({ _id: 'settings' });
        return config || {
            defaultRules: [
                "Hardcore mode must be enabled",
                "All achievements are eligible",
                "Progress tracked via retroachievements",
                "No hacks/save states/cheats allowed"
            ],
            defaultPoints: {
                first: 6,
                second: 4,
                third: 2
            },
            channels: {
                announcements: '1301710352261709895',
                submissions: '',
                leaderboard: ''
            },
            betaTesters: [],
            admins: [],
            nominatedGames: [],
            achievements: {
                titles: {
                    "Speedrunner": { requirement: "Complete 3 games in under 24 hours" },
                    "Completionist": { requirement: "100% complete 5 games" },
                    "Competitor": { requirement: "Place in top 3 for 3 months" }
                },
                badges: {
                    "First Blood": { requirement: "First to complete an achievement" },
                    "Perfect Month": { requirement: "100% completion in monthly challenge" }
                }
            }
        };
    }

    async saveConfiguration(config) {
        const collection = this.db.collection('config');
        await collection.updateOne(
            { _id: 'settings' },
            { $set: config },
            { upsert: true }
        );
    }
    
   async removeUser(username) {
        try {
            const cleanUsername = username.trim().toLowerCase();
            const stats = await this.getUserStats();
            
            if (stats && stats.users && stats.users[cleanUsername]) {
                delete stats.users[cleanUsername];
                await this.saveUserStats(stats);
                console.log(`User "${username}" removed successfully`);
                return true;
            } else {
                console.log(`User "${username}" not found in database`);
                return false;
            }
        } catch (error) {
            console.error('Error removing user:', error);
            throw error;
        }
    }
    
    async getShadowGame() {
        const collection = this.db.collection('shadowgame');
        const game = await collection.findOne({ _id: 'current' });
        return game || {
            active: false,
            currentProgress: 0,
            puzzles: [],
            finalReward: {
                gameId: "",
                gameName: "",
                points: 0
            }
        };
    }

    async saveShadowGame(game) {
        const collection = this.db.collection('shadowgame');
        await collection.updateOne(
            { _id: 'current' },
            { $set: game },
            { upsert: true }
        );
    }

    async getHighScores() {
        const collection = this.db.collection('highscores');
        const highscores = await collection.findOne({ _id: 'highscores' });
        return highscores || {
            games: {
                'Tony Hawk\'s Pro Skater': { platform: 'PSX', scores: [] },
                'Mr. Driller': { platform: 'PSX', scores: [] },
                'Tetris': { platform: 'Game Boy', scores: [] },
                'Ms. Pac-Man': { platform: 'NES', scores: [] },
                'Raiden Trad': { platform: 'SNES', scores: [] },
                'Community Game 1': { platform: 'TBA', scores: [] },
                'Community Game 2': { platform: 'TBA', scores: [] },
                'Community Game 3': { platform: 'TBA', scores: [] }
            }
        };
    }

    async saveHighScores(highscores) {
        const collection = this.db.collection('highscores');
        await collection.updateOne(
            { _id: 'highscores' },
            { $set: highscores },
            { upsert: true }
        );
    }
}

module.exports = new Database();

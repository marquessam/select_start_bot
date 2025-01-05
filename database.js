const { MongoClient } = require('mongodb');
const ErrorHandler = require('./utils/errorHandler');
const { fetchData } = require('./utils/dataFetcher');

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

            if (!this.client) {
                this.client = new MongoClient(process.env.MONGODB_URI, {
                    maxPoolSize: 10,
                    minPoolSize: 5,
                });

                await this.client.connect();
                this.db = this.client.db(process.env.DB_NAME || 'selectstart');
                console.log('Connected to MongoDB');

                this.client.on('error', (error) => {
                    ErrorHandler.logError(error, 'MongoDB Client');
                    this.reconnect();
                });

                await this.createIndexes();
            }
        } catch (error) {
            ErrorHandler.logError(error, 'Database Connect');
            throw error;
        }
    }

    
    async getArcadeScores() {
    const collection = await this.getCollection('arcadechallenge');
    return await fetchData(collection, { _id: 'scores' }, {
        games: {
            "Tony Hawk's Pro Skater": {
                platform: "PSX",
                scores: [],
                description: "High score in 2 minute runs"
            },
            "Mr. Driller": {
                platform: "PSX",
                scores: [],
                description: "Deepest depth reached (in feet)"
            },
            "Tetris": {
                platform: "Game Boy",
                scores: [],
                description: "Highest score in Type-A Mode"
            },
            "Ms. Pac-Man": {
                platform: "NES",
                scores: [],
                description: "Highest score on first board"
            },
            "Raiden Trad": {
                platform: "SNES",
                scores: [],
                description: "Highest score with 3 lives"
            },
            "Community Game 1": {
                platform: "TBA",
                scores: [],
                description: "TBD"
            },
            "Community Game 2": {
                platform: "TBA",
                scores: [],
                description: "TBD"
            },
            "Community Game 3": {
                platform: "TBA",
                scores: [],
                description: "TBD"
            }
        },
        expiryDate: "December 1st 2025"
    });
}

async updateArcadeScore(game, username, score) {
    const scores = await this.getArcadeScores();
    if (!scores.games[game]) return false;

    const gameScores = scores.games[game].scores;
    const newScore = { username, score, date: new Date().toISOString() };

    // Insert score in correct position
    gameScores.push(newScore);
    gameScores.sort((a, b) => b.score - a.score);
    
    // Keep only top 3
    scores.games[game].scores = gameScores.slice(0, 3);

    // Save updated scores
    const collection = await this.getCollection('arcadechallenge');
    await collection.updateOne(
        { _id: 'scores' },
        { $set: scores },
        { upsert: true }
    );

    return true;
}
async removeArcadeScore(gameName, username) {
    const collection = await this.getCollection('arcadechallenge');
    const data = await this.getArcadeScores();
    
    if (!data.games[gameName]) {
        throw new Error('Invalid game name');
    }

    // Filter out the user's score
    data.games[gameName].scores = data.games[gameName].scores.filter(
        score => score.username !== username.toLowerCase()
    );
    
    await collection.updateOne(
        { _id: 'scores' },
        { $set: data },
        { upsert: true }
    );
    
    return data.games[gameName].scores;
}

async resetArcadeScores(gameName) {
    const collection = await this.getCollection('arcadechallenge');
    const data = await this.getArcadeScores();
    
    if (!data.games[gameName]) {
        throw new Error('Invalid game name');
    }

    // Reset scores to empty array
    data.games[gameName].scores = [];
    
    await collection.updateOne(
        { _id: 'scores' },
        { $set: data },
        { upsert: true }
    );
    
    return [];
}
    async getHighScores() {
    const collection = await this.getCollection('arcadechallenge');
    return await fetchData(collection, { _id: 'scores' }, {
        games: {
            "Tony Hawk's Pro Skater": {
                platform: "PSX",
                description: "Highest possible score in 2 minute runs",
                scores: []
            },
            "Mr. Driller": {
                platform: "PSX",
                description: "Deepest depth reached (in feet)",
                scores: []
            },
            "Tetris": {
                platform: "Game Boy",
                description: "Highest possible score",
                scores: []
            },
            "Ms. Pac-Man": {
                platform: "NES",
                description: "Highest possible score",
                scores: []
            },
            "Raiden Trad": {
                platform: "SNES",
                description: "Highest possible score",
                scores: []
            },
            "Community Game 1": {
                platform: "TBA",
                description: "TBD",
                scores: []
            },
            "Community Game 2": {
                platform: "TBA",
                description: "TBD",
                scores: []
            },
            "Community Game 3": {
                platform: "TBA",
                description: "TBD",
                scores: []
            }
        },
        expiryDate: "December 1st 2025"
    });
}
    
    async saveHighScores(highscores) {
        const collection = await this.getCollection('highscores');
        await collection.updateOne(
            { _id: 'scores' },
            { $set: highscores },
            { upsert: true }
        );
    }
    
    async createIndexes() {
        try {
            // Define indexes for collections
            await this.db.collection('userstats').createIndex({ _id: 1 });
            await this.db.collection('challenges').createIndex({ _id: 1 });
            await this.db.collection('records').createIndex({ _id: 1 });
            await this.db.collection('highscores').createIndex({ _id: 1 });
            await this.db.collection('userstats').createIndex({ username: 1 });

            console.log('Indexes created successfully');
        } catch (error) {
            ErrorHandler.logError(error, 'Create Indexes');
            throw error;
        }
    }

    async reconnect() {
        console.log('Attempting to reconnect to MongoDB...');
        try {
            await this.disconnect();
            await this.connect();
        } catch (error) {
            ErrorHandler.logError(error, 'Database Reconnect');
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
            ErrorHandler.logError(error, 'Database Disconnect');
            throw error;
        }
    }

    async getCollection(collectionName) {
        if (!this.db) {
            throw new Error('Database not initialized. Call `connect()` first.');
        }
        return this.db.collection(collectionName);
    }

    async getUserStats() {
        const collection = await this.getCollection('userstats');
        return await fetchData(collection, { _id: 'stats' }, {
            users: {},
            yearlyStats: {},
            monthlyStats: {},
            gameCompletions: {},
            achievementStats: {},
            communityRecords: {
                fastestCompletions: {},
                highestScores: {},
                monthlyRecords: {},
                milestones: [],
                hallOfFame: {
                    perfectMonths: [],
                    speedrunners: [],
                    completionists: [],
                },
            },
        });
    }
    
    async saveUserStats(stats) {
        const collection = await this.getCollection('userstats');
        await collection.updateOne(
            { _id: 'stats' },
            { $set: stats },
            { upsert: true }
    );
}
    async getCommunityRecords() {
        const collection = await this.getCollection('records');
        return await fetchData(collection, { _id: 'records' }, {
            fastestCompletions: {},
            highestScores: {},
            monthlyRecords: {},
            yearlyRecords: {},
            milestones: [],
            hallOfFame: {
                perfectMonths: [],
                speedrunners: [],
                completionists: [],
            },
        });
    }

    async getCurrentChallenge() {
        const collection = await this.getCollection('challenges');
        return await fetchData(collection, { _id: 'current' }, {
            gameId: "",
            gameName: "",
            gameIcon: "",
            startDate: "",
            endDate: "",
            rules: [
                "Hardcore mode must be enabled",
                "All achievements are eligible",
                "Progress tracked via retroachievements",
                "No hacks/save states/cheats allowed",
            ],
            points: {
                first: 6,
                second: 4,
                third: 2,
            },
            stats: {
                participants: 0,
                totalAchievements: 0,
                averageCompletion: 0,
                startDate: null,
                lastUpdate: null,
                dailyStats: {},
                leaderboardHistory: [],
            },
        });
    }

    async getNextChallenge() {
        const collection = await this.getCollection('challenges');
        return await fetchData(collection, { _id: 'next' }, null);
    }
    
async getValidUsers() {
    const collection = await this.getCollection('users');
    const data = await collection.findOne({ _id: 'validUsers' });
    return data?.users || [];
}

async addValidUser(username) {
    const collection = await this.getCollection('users');
    await collection.updateOne(
        { _id: 'validUsers' },
        { $addToSet: { users: username.toLowerCase() } },
        { upsert: true }
    );
}

async removeValidUser(username) {
    const collection = await this.getCollection('users');
    await collection.updateOne(
        { _id: 'validUsers' },
        { $pull: { users: username.toLowerCase() } }
    );
}
    
    async getConfiguration() {
        const collection = await this.getCollection('config');
        return await fetchData(collection, { _id: 'settings' }, {
            defaultRules: [
                "Hardcore mode must be enabled",
                "All achievements are eligible",
                "Progress tracked via retroachievements",
                "No hacks/save states/cheats allowed",
            ],
            defaultPoints: {
                first: 6,
                second: 4,
                third: 2,
            },
            channels: {
                announcements: '',
                submissions: '',
                leaderboard: '',
            },
            betaTesters: [],
            admins: [],
            nominatedGames: [],
            achievements: {
                titles: {},
                badges: {},
            },
        });
    }

    async getShadowGame() {
        const collection = await this.getCollection('shadowgame');
        return await fetchData(collection, { _id: 'current' }, {
            active: false,
            currentProgress: 0,
            puzzles: [],
            finalReward: {
                gameId: "",
                gameName: "",
                points: 0,
            },
        });
    }
}

module.exports = new Database();

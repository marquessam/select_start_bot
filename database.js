const { MongoClient } = require('mongodb');
const ErrorHandler = require('./utils/errorHandler');
const { fetchData } = require('./utils/dataFetcher');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
    }

    // Connection Management
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

    async createIndexes() {
        try {
            await this.db.collection('userstats').createIndex({ _id: 1 });
            await this.db.collection('challenges').createIndex({ _id: 1 });
            await this.db.collection('records').createIndex({ _id: 1 });
            await this.db.collection('arcadechallenge').createIndex({ _id: 1 });
            await this.db.collection('userstats').createIndex({ username: 1 });
            console.log('Indexes created successfully');
        } catch (error) {
            ErrorHandler.logError(error, 'Create Indexes');
            throw error;
        }
    }

    // User Stats Methods
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
                }
            }
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

    // Arcade Challenge Methods
    async getArcadeScores() {
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
async refreshArcadeScores() {
    const defaultArcadeScores = {
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
                description: "Highest score on first board",
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
    };

    const collection = await this.getCollection('arcadechallenge');
    const existingData = await collection.findOne({ _id: "scores" });

    if (!existingData) {
        console.log('No existing data found. Inserting default arcade scores.');
        await collection.insertOne({ _id: "scores", ...defaultArcadeScores });
        return defaultArcadeScores;
    }

    // Check and update missing fields
    const updatedData = { ...defaultArcadeScores, ...existingData };

    for (const game in defaultArcadeScores.games) {
        if (!updatedData.games[game]) {
            updatedData.games[game] = defaultArcadeScores.games[game];
        } else {
            updatedData.games[game] = {
                ...defaultArcadeScores.games[game],
                ...updatedData.games[game]
            };
        }
    }

    if (JSON.stringify(updatedData) !== JSON.stringify(existingData)) {
        console.log('Updating arcade scores with missing fields.');
        await collection.updateOne({ _id: "scores" }, { $set: updatedData });
    }

    return updatedData;
}
    
    // Alias for backwards compatibility
    async getHighScores() {
        return this.getArcadeScores();
    }

    async saveArcadeScore(game, username, score) {
        const collection = await this.getCollection('arcadechallenge');
        const scores = await this.getArcadeScores();
        
        if (!scores.games[game]) {
            throw new Error('Invalid game name');
        }

        const newScore = { 
            username: username.toLowerCase(), 
            score: score, 
            date: new Date().toISOString() 
        };

        let gameScores = scores.games[game].scores || [];
        gameScores = gameScores.filter(s => s.username !== username.toLowerCase());
        gameScores.push(newScore);

        gameScores.sort((a, b) => b.score - a.score);
        scores.games[game].scores = gameScores.slice(0, 3);

        await collection.updateOne(
            { _id: 'scores' },
            { $set: scores },
            { upsert: true }
        );

        return scores.games[game].scores;
    }

    async removeArcadeScore(gameName, username) {
        const collection = await this.getCollection('arcadechallenge');
        const data = await this.getArcadeScores();
        
        if (!data.games[gameName]) {
            throw new Error('Invalid game name');
        }

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

        data.games[gameName].scores = [];
        
        await collection.updateOne(
            { _id: 'scores' },
            { $set: data },
            { upsert: true }
        );
        
        return [];
    }
    
async saveHighScores(highScores) {
    const collection = await this.getCollection('arcadechallenge');
    await collection.updateOne(
        { _id: 'scores' },  // Assumes a fixed `_id` for high scores
        { $set: highScores },
        { upsert: true }    // Create the document if it doesn't exist
    );
    console.log('High scores saved successfully.');
}
    
    // Community Records Methods
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
            }
        });
    }

    // Challenge Methods
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
            }
        });
    }

    async getNextChallenge() {
        const collection = await this.getCollection('challenges');
        return await fetchData(collection, { _id: 'next' }, null);
    }

    // Valid Users Methods
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

    // Configuration Methods
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
            }
        });
    }

    // Shadow Game Methods
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
            }
        });
    }
}

module.exports = new Database();

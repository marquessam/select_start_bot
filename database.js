const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
        
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI environment variable is not defined');
        }

        // Log the URI format (but not the credentials) for debugging
        const uriFormat = process.env.MONGODB_URI.replace(/:([^@]+)@/, ':***@');
        console.log('MongoDB URI format:', uriFormat);
    }

    async connect() {
        try {
            if (this.client) {
                console.log('Already connected to MongoDB');
                return;
            }

            this.client = new MongoClient(process.env.MONGODB_URI, {
                serverSelectionTimeoutMS: 5000,
                maxPoolSize: 10
            });
            
            // Test the connection before proceeding
            await this.client.connect();
            await this.client.db().admin().ping();
            
            this.db = this.client.db('selectstart');
            console.log('Successfully connected to MongoDB');

            // Add connection error handler
            this.client.on('error', (error) => {
                console.error('MongoDB connection error:', error);
                this.reconnect();
            });

        } catch (error) {
            if (error.name === 'MongoServerError') {
                console.error('MongoDB Authentication Error:');
                console.error('- Error Code:', error.code);
                console.error('- Error Message:', error.errmsg);
                if (error.code === 8000) {
                    console.error('Authentication failed. Please check:');
                    console.error('1. Username and password are correct');
                    console.error('2. User has correct database permissions');
                    console.error('3. Database name is correct');
                    console.error('4. Special characters in password are URL encoded');
                }
            }
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
            // Try to reconnect again after 5 seconds
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
        if (!this.db) {
            throw new Error('Database not connected. Call connect() first.');
        }

        try {
            const collection = this.db.collection('userstats');
            const stats = await collection.findOne({ _id: 'stats' });
            return stats || {
                users: {},
                yearlyStats: {},
                monthlyStats: {}
            };
        } catch (error) {
            console.error('Error fetching user stats:', error);
            throw error;
        }
    }

    async saveUserStats(stats) {
        if (!this.db) {
            throw new Error('Database not connected. Call connect() first.');
        }

        try {
            const collection = this.db.collection('userstats');
            await collection.updateOne(
                { _id: 'stats' },
                { $set: stats },
                { upsert: true }
            );
        } catch (error) {
            console.error('Error saving user stats:', error);
            throw error;
        }
    }

    async getChallenges() {
        if (!this.db) {
            throw new Error('Database not connected. Call connect() first.');
        }

        try {
            const collection = this.db.collection('challenges');
            const challenges = await collection.findOne({ _id: 'challenges' });
            return challenges || {
                currentChallenge: null,
                nextChallenge: null
            };
        } catch (error) {
            console.error('Error fetching challenges:', error);
            throw error;
        }
    }

    async saveChallenges(challenges) {
        if (!this.db) {
            throw new Error('Database not connected. Call connect() first.');
        }

        try {
            const collection = this.db.collection('challenges');
            await collection.updateOne(
                { _id: 'challenges' },
                { $set: challenges },
                { upsert: true }
            );
        } catch (error) {
            console.error('Error saving challenges:', error);
            throw error;
        }
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
    
    // Helper method to check if connection is alive
    async isConnected() {
        try {
            if (!this.client) return false;
            await this.client.db().admin().ping();
            return true;
        } catch {
            return false;
        }
    }
}

// Add these methods to your database.js file

async getCurrentChallenge() {
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
        }
    };
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
        nominatedGames: []
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

// Export a single instance
const database = new Database();

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Closing MongoDB connection...');
    await database.disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Closing MongoDB connection...');
    await database.disconnect();
    process.exit(0);
});

module.exports = database;

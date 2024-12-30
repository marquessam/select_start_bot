const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
        
        // Validate MongoDB URI at construction
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI environment variable is not defined');
        }
    }

    async connect() {
        try {
            if (this.client) {
                console.log('Already connected to MongoDB');
                return;
            }

            this.client = new MongoClient(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 5000,
                maxPoolSize: 10
            });
            
            await this.client.connect();
            this.db = this.client.db('selectstart');
            console.log('Connected to MongoDB');

            // Add connection error handler
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

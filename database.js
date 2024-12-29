// database.js
const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
    }

    async connect() {
        try {
            this.client = new MongoClient(process.env.MONGODB_URI);
            await this.client.connect();
            this.db = this.client.db('selectstart');
            console.log('Connected to MongoDB');
        } catch (error) {
            console.error('MongoDB connection error:', error);
            throw error;
        }
    }

    async getUserStats() {
        const collection = this.db.collection('userstats');
        const stats = await collection.findOne({ _id: 'stats' });
        return stats || {
            users: {},
            yearlyStats: {},
            monthlyStats: {}
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

    async getChallenges() {
        const collection = this.db.collection('challenges');
        const challenges = await collection.findOne({ _id: 'challenges' });
        return challenges || {
            currentChallenge: null,
            nextChallenge: null
        };
    }

    async saveChallenges(challenges) {
        const collection = this.db.collection('challenges');
        await collection.updateOne(
            { _id: 'challenges' },
            { $set: challenges },
            { upsert: true }
        );
    }
}

module.exports = new Database();

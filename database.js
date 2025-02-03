const { MongoClient } = require('mongodb');
const { ErrorHandler, BotError } = require('./utils/errorHandler');
const { fetchData } = require('./utils/dataFetcher');
const { commonValidators } = require('./utils/validators');
const { withTransaction } = require('./utils/transactions');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
    }

    // =====================
    // Connection Management
    // =====================
    async connect() {
        try {
            if (!process.env.MONGODB_URI) {
                throw new Error('MONGODB_URI environment variable is not defined');
            }

            if (!this.client) {
                this.client = new MongoClient(process.env.MONGODB_URI, {
                    maxPoolSize: 10,
                    minPoolSize: 5,
                    retryWrites: true,
                    retryReads: true,
                    serverSelectionTimeoutMS: 5000,
                    connectTimeoutMS: 10000
                });

                await this.client.connect();
                this.db = this.client.db(process.env.DB_NAME || 'selectstart');
                console.log('[DATABASE] Connected to MongoDB');

                this.client.on('error', (error) => {
                    console.error('[DATABASE] MongoDB Client Error:', error);
                    this.reconnect();
                });

                await this.ensureCollections();
                await this.createIndexes();
            }
        } catch (error) {
            console.error('[DATABASE] Connection error:', error);
            throw error;
        }
    }

    async reconnect() {
        console.log('[DATABASE] Attempting to reconnect...');
        try {
            await this.disconnect();
            await this.connect();
        } catch (error) {
            console.error('[DATABASE] Reconnection error:', error);
            setTimeout(() => this.reconnect(), 5000);
        }
    }

    async disconnect() {
        try {
            if (this.client) {
                await this.client.close();
                this.client = null;
                this.db = null;
                console.log('[DATABASE] Disconnected from MongoDB');
            }
        } catch (error) {
            console.error('[DATABASE] Disconnect error:', error);
            throw error;
        }
    }

    async getCollection(collectionName) {
        if (!this.db) {
            throw new Error('[DATABASE] ERROR: Database connection not established.');
        }
        console.log(`[DEBUG] Fetching collection: ${collectionName}`);
        const collection = this.db.collection(collectionName);
        if (!collection || typeof collection.find !== 'function') {
            console.error(`[ERROR] Collection '${collectionName}' is not valid!`);
            return null;
        }
        return collection;
    }

    async ensureCollections() {
        try {
            const requiredCollections = [
                'userstats',
                'users',
                'challenges',
                'achievements',
                'achievement_records',
                'achievement_timestamps',
                'arcadechallenge',
                'reviews',
                'nominations',
                'shadowgame',
                'records',
                'config'
            ];

            const existingCollections = await this.db.listCollections().toArray();
            const existingNames = existingCollections.map(c => c.name);

            for (const collection of requiredCollections) {
                if (!existingNames.includes(collection)) {
                    await this.db.createCollection(collection);
                    console.log(`[DATABASE] Created collection: ${collection}`);
                }
            }
        } catch (error) {
            console.error('[DATABASE] Error ensuring collections:', error);
            throw error;
        }
    }

    async createIndexes() {
        try {
            console.log('[DATABASE] Creating indexes...');
            
            // Core collections
            await this.db.collection('userstats').createIndex({ _id: 1 });
            await this.db.collection('users').createIndex({ username: 1 }, { 
                unique: true,
                name: 'username_unique' 
            });

            // Achievement records indexes
            await this.db.collection('achievement_records').createIndex(
                {
                    username: 1,
                    gameId: 1,
                    type: 1,
                    month: 1,
                    year: 1
                },
                { unique: true }
            );

            await this.db.collection('achievement_records').createIndex(
                { date: -1 },
                { name: 'achievement_records_date' }
            );

            // Additional indexes for achievement querying
            await this.db.collection('achievement_records').createIndex(
                { username: 1, year: 1 },
                { name: 'yearly_achievements' }
            );

            await this.db.collection('achievement_records').createIndex(
                { username: 1, month: 1, year: 1 },
                { name: 'monthly_achievements' }
            );

            // Other indexes remain the same...
            await this.db.collection('challenges').createIndex({ _id: 1 });
            await this.db.collection('reviews').createIndex({ _id: 1 });
            await this.db.collection('nominations').createIndex({ _id: 1 });
            await this.db.collection('shadowgame').createIndex({ _id: 1 });
            await this.db.collection('records').createIndex({ _id: 1 });
            await this.db.collection('config').createIndex({ _id: 1 });

            console.log('[DATABASE] Indexes created successfully');
            return true;
        } catch (error) {
            console.error('[DATABASE] Error creating indexes:', error);
            throw error;
        }
    }

// ==================
    // Achievement Methods
    // ==================
    
    async getAchievementRecords(username, month = null, year = null) {
        try {
            const query = { username: username.toLowerCase() };
            if (month) query.month = parseInt(month);
            if (year) query.year = year.toString();

            const collection = await this.getCollection('achievement_records');
            return await collection.find(query).toArray();
        } catch (error) {
            console.error('[DATABASE] Error getting achievement records:', error);
            return [];
        }
    }

    async addAchievementRecord(record) {
        try {
            const collection = await this.getCollection('achievement_records');
            
            // Check for existing record
            const exists = await collection.findOne({
                username: record.username.toLowerCase(),
                gameId: record.gameId,
                type: record.type,
                month: record.month,
                year: record.year
            });

            if (exists) {
                console.log(`[DATABASE] Achievement record already exists for ${record.username}`);
                return false;
            }

            await collection.insertOne(record);
            return true;
        } catch (error) {
            console.error('[DATABASE] Error adding achievement record:', error);
            return false;
        }
    }

    async getMonthlyAchievements(month, year) {
        try {
            const collection = await this.getCollection('achievement_records');
            return await collection.find({
                month: parseInt(month),
                year: year.toString()
            }).toArray();
        } catch (error) {
            console.error('[DATABASE] Error getting monthly achievements:', error);
            return [];
        }
    }

    async getYearlyAchievements(year) {
        try {
            const collection = await this.getCollection('achievement_records');
            return await collection.find({
                year: year.toString()
            }).toArray();
        } catch (error) {
            console.error('[DATABASE] Error getting yearly achievements:', error);
            return [];
        }
    }
        async getLastAchievementTimestamps() {
        try {
            const collection = await this.getCollection('achievement_timestamps');
            const timestamps = await collection.findOne({ _id: 'timestamps' });
            return timestamps?.data || {};
        } catch (error) {
            console.error('[DATABASE] Error getting achievement timestamps:', error);
            return {};
        }
    }

    async getLastAchievementTimestamp(username) {
        try {
            const timestamps = await this.getLastAchievementTimestamps();
            return timestamps[username.toLowerCase()] || null;
        } catch (error) {
            console.error('[DATABASE] Error getting achievement timestamp:', error);
            return null;
        }
    }

    async updateLastAchievementTimestamp(username, timestamp) {
        try {
            const collection = await this.getCollection('achievement_timestamps');
            await collection.updateOne(
                { _id: 'timestamps' },
                { 
                    $set: { [`data.${username.toLowerCase()}`]: timestamp }
                },
                { upsert: true }
            );
            return true;
        } catch (error) {
            console.error('[DATABASE] Error updating achievement timestamp:', error);
            return false;
        }
    }


    // ===================
    // User Management
    // ===================
    
    async manageUser(action, username, newUsername = null) {
        try {
            const collection = await this.getCollection('users');
            const cleanUsername = username.trim().toLowerCase();
            const data = await collection.findOne({ _id: 'validUsers' });
            const existingUsers = data?.users || [];

            switch(action) {
                case 'add': {
                    const filteredUsers = existingUsers.filter(
                        u => u.toLowerCase() !== cleanUsername
                    );
                    filteredUsers.push(username.trim());
                    await collection.updateOne(
                        { _id: 'validUsers' },
                        { $set: { users: filteredUsers } },
                        { upsert: true }
                    );
                    return true;
                }
                
                case 'remove': {
                    const filteredUsers = existingUsers.filter(
                        u => u.toLowerCase() !== cleanUsername
                    );
                    await collection.updateOne(
                        { _id: 'validUsers' },
                        { $set: { users: filteredUsers } }
                    );

                    // Also remove their achievement records
                    const achievementCollection = await this.getCollection('achievement_records');
                    await achievementCollection.deleteMany({ username: cleanUsername });
                    
                    return true;
                }
                
                case 'update': {
                    if (!newUsername || cleanUsername !== newUsername.toLowerCase()) {
                        throw new Error('Invalid username update parameters');
                    }
                    const index = existingUsers.findIndex(
                        u => u.toLowerCase() === cleanUsername
                    );
                    if (index !== -1) {
                        existingUsers[index] = newUsername;
                        await collection.updateOne(
                            { _id: 'validUsers' },
                            { $set: { users: existingUsers } }
                        );

                        // Update username in achievement records
                        const achievementCollection = await this.getCollection('achievement_records');
                        await achievementCollection.updateMany(
                            { username: cleanUsername },
                            { $set: { username: newUsername.toLowerCase() } }
                        );
                        
                        return true;
                    }
                    return false;
                }
                
                case 'find':
                    return existingUsers.find(
                        u => u.toLowerCase() === cleanUsername
                    ) || null;
                
                default:
                    throw new Error('Invalid user management action');
            }
        } catch (error) {
            console.error('[DATABASE] User management error:', error);
            throw error;
        }
    }

    async getValidUsers() {
        try {
            const collection = await this.getCollection('users');
            const data = await collection.findOne({ _id: 'validUsers' });
            return (data?.users || []).map(u => u.trim().toLowerCase());
        } catch (error) {
            console.error('[DATABASE] Error getting valid users:', error);
            return [];
        }
    }

    async getUserStats(username) {
        try {
            const [yearlyAchievements, monthlyAchievements] = await Promise.all([
                this.getYearlyAchievements(new Date().getFullYear()),
                this.getMonthlyAchievements(new Date().getMonth() + 1, new Date().getFullYear())
            ]);

            const userYearlyAchievements = yearlyAchievements.filter(
                a => a.username === username.toLowerCase()
            );
            const userMonthlyAchievements = monthlyAchievements.filter(
                a => a.username === username.toLowerCase()
            );

            return {
                username: username,
                yearlyPoints: userYearlyAchievements.reduce((sum, a) => sum + a.points, 0),
                monthlyPoints: userMonthlyAchievements.reduce((sum, a) => sum + a.points, 0),
                achievements: {
                    yearly: userYearlyAchievements,
                    monthly: userMonthlyAchievements
                }
            };
        } catch (error) {
            console.error('[DATABASE] Error getting user stats:', error);
            return null;
        }
    }

    async calculateLeaderboard(month = null, year = null) {
        try {
            const collection = await this.getCollection('achievement_records');
            const query = {};
            
            if (month) query.month = parseInt(month);
            if (year) query.year = year.toString();

            const pipeline = [
                { $match: query },
                {
                    $group: {
                        _id: "$username",
                        totalPoints: { $sum: "$points" },
                        achievements: { $push: "$$ROOT" }
                    }
                },
                { $sort: { totalPoints: -1 } }
            ];

            return await collection.aggregate(pipeline).toArray();
        } catch (error) {
            console.error('[DATABASE] Error calculating leaderboard:', error);
            return [];
        }
    }

// ==================
    // Challenge Methods
    // ==================
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
                "Any discrepancies, ties, or edge case situations will be judged case by case"
            ],
            stats: {
                participants: 0,
                totalAchievements: 0,
                averageCompletion: 0,
                startDate: null,
                lastUpdate: null,
                dailyStats: {},
                leaderboardHistory: []
            }
        });
    }

    async saveChallenge(data, type = 'current') {
        try {
            const collection = await this.getCollection('challenges');
            
            const challengeData = { ...data };
            delete challengeData._id;

            const result = await collection.updateOne(
                { _id: type },
                { $set: challengeData },
                { upsert: true }
            );

            if (type === 'current') {
                await this.addGameToHistory({
                    gameId: data.gameId,
                    gameName: data.gameName,
                    gameIcon: data.gameIcon,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    month: new Date().toLocaleString('default', { month: 'long' }),
                    year: new Date().getFullYear().toString(),
                    date: new Date().toISOString()
                });
            }

            return true;
        } catch (error) {
            console.error('Error saving challenge:', error);
            throw error;
        }
    }

    async getPreviousChallenges() {
        const collection = await this.getCollection('challenges');
        return await fetchData(collection, { _id: 'history' }, {
            games: []
        }).then(data => data.games || []);
    }

    async addGameToHistory(gameData) {
        try {
            const collection = await this.getCollection('challenges');
            await collection.updateOne(
                { _id: 'history' },
                { $addToSet: { games: gameData } },
                { upsert: true }
            );
            return true;
        } catch (error) {
            console.error('[DATABASE] Error adding game to history:', error);
            throw error;
        }
    }

    // ================
    // Arcade Methods
    // ================
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
                }
            },
            expiryDate: "December 1st 2025"
        });
    }

    async saveArcadeScore(game, username, score) {
        try {
            const collection = await this.getCollection('arcadechallenge');
            const data = await this.getArcadeScores();
            
            if (!data.games[game]) {
                throw new Error(`Invalid game: ${game}`);
            }

            // Remove existing score for this user
            data.games[game].scores = data.games[game].scores.filter(
                s => s.username.toLowerCase() !== username.toLowerCase()
            );

            // Add new score
            data.games[game].scores.push({
                username: username.toLowerCase(),
                score: parseInt(score),
                date: new Date().toISOString(),
                verified: false
            });

            // Sort and keep top 3
            data.games[game].scores.sort((a, b) => b.score - a.score);
            data.games[game].scores = data.games[game].scores.slice(0, 3);

            await collection.updateOne(
                { _id: 'scores' },
                { $set: data },
                { upsert: true }
            );

            return data.games[game].scores;
        } catch (error) {
            console.error('[DATABASE] Error saving arcade score:', error);
            throw error;
        }
    }

    // =================
    // Shadow Game Methods
    // =================
    async getShadowGame() {
        const collection = await this.getCollection('shadowgame');
        return await fetchData(collection, { _id: 'current' }, {
            active: false,
            currentProgress: 0,
            triforceState: {
                wisdom: { required: 6, found: 0, pieces: [], collected: [] },
                courage: { required: 6, found: 0, pieces: [], collected: [] },
                power: { collected: false }
            },
            finalReward: {
                gameId: "274",
                gameName: "U.N. Squadron",
                points: {
                    participation: 1,
                    beaten: 3
                }
            }
        });
    }

    async saveShadowGame(data) {
        try {
            const collection = await this.getCollection('shadowgame');
            await collection.updateOne(
                { _id: 'current' },
                { $set: data },
                { upsert: true }
            );
            return true;
        } catch (error) {
            console.error('[DATABASE] Error saving shadow game:', error);
            throw error;
        }
    }

    // =================
    // Review Methods
    // =================
    async getReviews() {
        const collection = await this.getCollection('reviews');
        return await fetchData(collection, { _id: 'reviews' }, {
            games: {}
        });
    }

    async saveReview(gameName, username, review) {
        try {
            const collection = await this.getCollection('reviews');
            const reviews = await this.getReviews();

            if (!reviews.games[gameName]) {
                reviews.games[gameName] = {
                    reviews: [],
                    averageScores: {
                        art: 0,
                        story: 0,
                        combat: 0,
                        music: 0,
                        overall: 0
                    }
                };
            }

            // Add or update review
            const gameReviews = reviews.games[gameName];
            const existingReviewIndex = gameReviews.reviews.findIndex(
                r => r.username.toLowerCase() === username.toLowerCase()
            );

            const reviewData = {
                username,
                ...review,
                date: new Date().toISOString()
            };

            if (existingReviewIndex !== -1) {
                gameReviews.reviews[existingReviewIndex] = reviewData;
            } else {
                gameReviews.reviews.push(reviewData);
            }

            // Update average scores
            const avgScores = gameReviews.averageScores;
            const reviewCount = gameReviews.reviews.length;
            
            ['art', 'story', 'combat', 'music', 'overall'].forEach(category => {
                const sum = gameReviews.reviews.reduce((acc, r) => acc + r.scores[category], 0);
                avgScores[category] = Number((sum / reviewCount).toFixed(1));
            });

            await collection.updateOne(
                { _id: 'reviews' },
                { $set: reviews },
                { upsert: true }
            );

            return gameReviews;
        } catch (error) {
            console.error('[DATABASE] Error saving review:', error);
            throw error;
        }
    }

    // =================
    // Configuration Methods
    // =================
    async getConfiguration() {
        const collection = await this.getCollection('config');
        return await fetchData(collection, { _id: 'settings' }, {
            defaultRules: [
                "Hardcore mode must be enabled",
                "All achievements are eligible",
                "Progress tracked via retroachievements",
                "No hacks/save states/cheats allowed"
            ],
            channels: {
                announcements: '',
                submissions: '',
                leaderboard: ''
            },
            admins: [],
            achievements: {
                titles: {},
                badges: {}
            }
        });
    }

    async saveConfiguration(config) {
        try {
            const collection = await this.getCollection('config');
            await collection.updateOne(
                { _id: 'settings' },
                { $set: config },
                { upsert: true }
            );
            return true;
        } catch (error) {
            console.error('[DATABASE] Error saving configuration:', error);
            throw error;
        }
    }
}

module.exports = new Database();

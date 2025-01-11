const { MongoClient } = require('mongodb');
const { ErrorHandler } = require('./utils/errorHandler');
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
            throw new BotError(
                'MONGODB_URI environment variable is not defined',
                ErrorHandler.ERROR_TYPES.DATABASE,
                'Database Connection'
            );
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
            console.log('Connected to MongoDB');

            this.client.on('error', (error) => {
                ErrorHandler.handleDatabaseError(error, 'MongoDB Client');
                this.reconnect();
            });

            await this.createIndexes();
        }
    } catch (error) {
        const errorMessage = ErrorHandler.handleDatabaseError(error, 'Database Connect');
        throw new BotError(errorMessage, ErrorHandler.ERROR_TYPES.DATABASE, 'Database Connection', error);
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
            await this.db.collection('reviews').createIndex({ _id: 1 });
            await this.db.collection('users').createIndex({ username: 1 });
            console.log('Indexes created successfully');
        } catch (error) {
            ErrorHandler.logError(error, 'Create Indexes');
            throw error;
        }
    }

    // ==================
    // Challenge Methods
    // ==================
    
    async saveChallenge(data, type = 'current') {
        try {
            const collection = await this.getCollection('challenges');
            await collection.updateOne(
                { _id: type },
                { $set: data },
                { upsert: true }
            );
            return true;
        } catch (error) {
            ErrorHandler.logError(error, 'Save Challenge');
            throw error;
        }
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
            }
        });
    }

    async getNextChallenge() {
        const collection = await this.getCollection('challenges');
        return await fetchData(collection, { _id: 'next' }, null);
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
            ErrorHandler.logError(error, `User Management - ${action}`);
            throw error;
        }
    }

    async getValidUsers() {
        try {
            const collection = await this.getCollection('users');
            const data = await collection.findOne({ _id: 'validUsers' });
            return (data?.users || []).map(u => u.trim().toLowerCase());
        } catch (error) {
            ErrorHandler.logError(error, 'Get Valid Users');
            return [];
        }
    }

   // =================
    // Arcade Methods
    // =================
    
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
                    description: "Highest score on first board",
                    scores: []
                },
                "Raiden Trad": {
                    platform: "SNES",
                    description: "Highest possible score",
                    scores: []
                }
            },
            expiryDate: "December 1st 2025"
        });
    }

   async saveArcadeScore(game, username, score, retryCount = 3) {
    try {
        const collection = await this.getCollection('arcadechallenge');
        const scores = await this.getArcadeScores();

        if (!scores.games[game]) {
            throw new Error(`Invalid game name: ${game}`);
        }

        // Validate inputs
        if (!commonValidators.username(username)) {
            throw new Error('Invalid username format');
        }
        if (!commonValidators.score(score)) {
            throw new Error('Invalid score value');
        }

        let success = false;
        let attempt = 0;
        let lastError = null;

        while (!success && attempt < retryCount) {
            try {
                await withTransaction(this, async (session) => {
                    let gameScores = scores.games[game].scores || [];
                    gameScores = gameScores.filter(s => s.username.toLowerCase() !== username.toLowerCase());
                    
                    gameScores.push({
                        username: username.toLowerCase(),
                        score: score,
                        date: new Date().toISOString(),
                        verified: false  // New field for score verification
                    });

                    // Sort and limit to top 3
                    gameScores.sort((a, b) => b.score - a.score);
                    scores.games[game].scores = gameScores.slice(0, 3);

                    await collection.updateOne(
                        { _id: 'scores' },
                        { $set: scores },
                        { session, upsert: true }
                    );
                });
                success = true;
            } catch (error) {
                lastError = error;
                attempt++;
                if (attempt < retryCount) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }

        if (!success) {
            throw lastError || new Error('Failed to save score after multiple attempts');
        }

        return scores.games[game].scores;
    } catch (error) {
        ErrorHandler.logError(error, 'Save Arcade Score');
        throw error;
    }
}
    
async verifyArcadeScore(game, username) {
    try {
        const collection = await this.getCollection('arcadechallenge');
        const scores = await this.getArcadeScores();

        if (!scores.games[game]?.scores) return false;

        await withTransaction(this, async (session) => {
            const scoreIndex = scores.games[game].scores.findIndex(
                s => s.username.toLowerCase() === username.toLowerCase()
            );

            if (scoreIndex !== -1) {
                scores.games[game].scores[scoreIndex].verified = true;
                scores.games[game].scores[scoreIndex].verifiedDate = new Date().toISOString();

                await collection.updateOne(
                    { _id: 'scores' },
                    { $set: scores },
                    { session }
                );
            }
        });

        return true;
    } catch (error) {
        ErrorHandler.logError(error, 'Verify Arcade Score');
        return false;
    }
}
    async removeArcadeScore(gameName, username) {
        try {
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
        } catch (error) {
            ErrorHandler.logError(error, 'Remove Arcade Score');
            throw error;
        }
    }

    async updateArcadeRules(gameName, newRules) {
        try {
            const collection = await this.getCollection('arcadechallenge');
            const data = await this.getArcadeScores();
            
            if (!data.games[gameName]) {
                throw new Error('Invalid game name');
            }

            data.games[gameName].description = newRules;
            
            await collection.updateOne(
                { _id: 'scores' },
                { $set: data },
                { upsert: true }
            );
            
            return data.games[gameName];
        } catch (error) {
            ErrorHandler.logError(error, 'Update Arcade Rules');
            throw error;
        }
    }

    async resetArcadeScores(gameName) {
        try {
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
        } catch (error) {
            ErrorHandler.logError(error, 'Reset Arcade Scores');
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
            ErrorHandler.logError(error, 'Save Review');
            throw error;
        }
    }

    async getReviewsForGame(gameName) {
    try {
        // Get the collection for reviews
        const collection = await this.getCollection('reviews');

        // Fetch reviews for the specified game
        const result = await collection.findOne({ _id: 'reviews' });

        if (!result || !result.games || !result.games[gameName]) {
            // If no reviews exist for the game, return an empty array
            return [];
        }

        // Return the reviews array for the game
        return result.games[gameName].reviews || [];
    } catch (error) {
        ErrorHandler.logError(error, `Fetching reviews for game: ${gameName}`);
        throw new Error('Failed to retrieve reviews for the specified game.');
    }
}

    // ===================
    // Nomination Methods
    // ===================
    
    async getNominationStatus() {
        const collection = await this.getCollection('nominations');
        return await fetchData(collection, { _id: 'status' }, {
            isOpen: false,
            lastOpenDate: null,
            lastCloseDate: null
        });
    }

    async setNominationStatus(isOpen) {
        const collection = await this.getCollection('nominations');
        const timestamp = new Date().toISOString();
        await collection.updateOne(
            { _id: 'status' },
            {
                $set: {
                    isOpen,
                    [isOpen ? 'lastOpenDate' : 'lastCloseDate']: timestamp
                }
            },
            { upsert: true }
        );
    }

    async getNominations(period = null) {
        const collection = await this.getCollection('nominations');
        
        if (!period) {
            const currentPeriod = await collection.findOne({ _id: 'currentPeriod' });
            period = currentPeriod?.period || new Date().toISOString().slice(0, 7);
        }

        const nominations = await collection.findOne({ _id: 'nominations' });
        return nominations?.nominations?.[period] || [];
    }

    async addNomination(nomination) {
        const collection = await this.getCollection('nominations');
        const period = new Date().toISOString().slice(0, 7);

        await collection.updateOne(
            { _id: 'nominations' },
            {
                $push: {
                    [`nominations.${period}`]: nomination
                }
            },
            { upsert: true }
        );

        await collection.updateOne(
            { _id: 'currentPeriod' },
            { $set: { period } },
            { upsert: true }
        );
    }

    async getUserNominationCount(discordId) {
    try {
        const collection = await this.getCollection('nominations');
        const period = new Date().toISOString().slice(0, 7);
        const nominations = await collection.findOne({ _id: 'nominations' });
        
        // Count nominations for this user in current period
        const userNominations = nominations?.nominations?.[period]?.filter(nom => 
            nom.discordId === discordId
        ) || [];
        
        return userNominations.length;
    } catch (error) {
        ErrorHandler.logError(error, 'Get User Nomination Count');
        return 0;
    }
}
    
    // ===================
    // Shadow Game Methods
    // ===================
    
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

    async saveShadowGame(shadowGame) {
        try {
            const collection = await this.getCollection('shadowgame');
            await collection.updateOne(
                { _id: 'current' },
                { $set: shadowGame },
                { upsert: true }
            );
            return true;
        } catch (error) {
            ErrorHandler.logError(error, 'Save Shadow Game');
            throw error;
        }
    }

  // ===================
    // Stats Methods
    // ===================
    
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
                yearlyRecords: {},
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
        try {
            const collection = await this.getCollection('userstats');
            await collection.updateOne(
                { _id: 'stats' },
                { $set: stats },
                { upsert: true }
            );
            return true;
        } catch (error) {
            ErrorHandler.logError(error, 'Save User Stats');
            throw error;
        }
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
            }
        });
    }

    async saveCommunityRecords(records) {
        try {
            const collection = await this.getCollection('records');
            await collection.updateOne(
                { _id: 'records' },
                { $set: records },
                { upsert: true }
            );
            return true;
        } catch (error) {
            ErrorHandler.logError(error, 'Save Community Records');
            throw error;
        }
    }

    // ===================
    // Configuration Methods
    // ===================
    
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
            ErrorHandler.logError(error, 'Save Configuration');
            throw error;
        }
    }

    // ===================
    // Game List Methods
    // ===================
    
 async getValidGamesList() {
    try {
        const currentChallenge = await this.getCurrentChallenge();
        const highScores = await this.getHighScores();
        const reviews = await this.getReviews();
        const previousChallenges = await this.getPreviousChallenges();

        const currentGame = currentChallenge?.gameName ? [currentChallenge.gameName] : [];
        const highScoreGames = highScores?.games ? Object.keys(highScores.games) : [];
        const reviewGames = reviews?.games ? Object.keys(reviews.games) : [];
        const previousGameNames = previousChallenges?.map(game => game.gameName).filter(Boolean) || [];

        const validGames = new Set([
            ...currentGame,
            ...highScoreGames,
            ...reviewGames,
            ...previousGameNames,
        ]);

        return Array.from(validGames);
    } catch (error) {
        console.error('Error in getValidGamesList:', error); // Temporary logging fallback
        throw new Error('Failed to retrieve valid games list');
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
            ErrorHandler.logError(error, 'Add Game To History');
            throw error;
        }
    }
}

module.exports = new Database();

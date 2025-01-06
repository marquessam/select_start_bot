const { MongoClient } = require('mongodb');
const ErrorHandler = require('./utils/errorHandler');
const { fetchData } = require('./utils/dataFetcher');

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
            await this.db.collection('reviews').createIndex({ _id: 1 });
            await this.db.collection('users').createIndex({ username: 1 });
            console.log('Indexes created successfully');
        } catch (error) {
            ErrorHandler.logError(error, 'Create Indexes');
            throw error;
        }
    }

    // ==================
    // Game List Methods
    // ==================
    async getValidGamesList() {
        try {
            const currentChallenge = await this.getCurrentChallenge();
            const arcadeGames = await this.getArcadeScores();
            const reviews = await this.getReviews();
            const previousGames = await this.getPreviousChallenges();
            
            const validGames = new Set([
                currentChallenge.gameName,
                ...Object.keys(arcadeGames.games),
                ...Object.keys(reviews.games),
                ...previousGames.map(game => game.gameName)
            ].filter(Boolean));

            return Array.from(validGames);
        } catch (error) {
            ErrorHandler.logError(error, 'Get Valid Games List');
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
        const collection = await this.getCollection('challenges');
        await collection.updateOne(
            { _id: 'history' },
            { $addToSet: { games: gameData } },
            { upsert: true }
        );
    }

    // ================
    // Review Methods
    // ================
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
            const existingReviewIndex = gameReviews.reviews.findIndex(r => 
                r.username.toLowerCase() === username.toLowerCase()
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

    async getHighScores() {
        return this.getArcadeScores();
    }

   async saveArcadeScore(game, username, score) {
    try {
        const collection = await this.getCollection('arcadechallenge');
        const scores = await this.getArcadeScores();

        // Ensure scores structure is valid
        if (!scores || !scores.games || !scores.games[game]) {
            throw new Error(`Invalid game name: ${game}`);
        }

        const newScore = {
            username: username.toLowerCase(),
            score: score,
            date: new Date().toISOString(),
        };

        // Update game scores
        let gameScores = scores.games[game].scores || [];
        gameScores = gameScores.filter(s => s.username !== username.toLowerCase());
        gameScores.push(newScore);

        // Sort and limit top 3 scores
        gameScores.sort((a, b) => b.score - a.score);
        scores.games[game].scores = gameScores.slice(0, 3);

        // Save updated scores to the database
        await collection.updateOne(
            { _id: 'scores' },
            { $set: scores },
            { upsert: true }
        );

        console.log(`[DATABASE] Updated scores for game: ${game}`);
        return scores.games[game].scores;
    } catch (error) {
        console.error(`[DATABASE] Error saving arcade score: ${error.message}`);
        ErrorHandler.logError(error, 'Save Arcade Score');
        throw error;
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

  async refreshArcadeScores() {
    try {
        const collection = await this.getCollection('arcadechallenge');
        const currentScores = await this.getArcadeScores();
        
        // Update/upsert the scores document
        await collection.updateOne(
            { _id: 'scores' },
            { 
                $set: {
                    ...currentScores,
                    lastUpdated: new Date().toISOString()
                }
            },
            { upsert: true }
        );
        
        console.log('[DATABASE] Refreshed arcade scores');
        return currentScores;
    } catch (error) {
        console.error('[DATABASE] Error refreshing arcade scores:', error);
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

    // ===================
    // Challenge Methods
    // ===================
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

   // ==================
    // User Methods
    // ==================
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

   async addValidUser(username) {
    try {
        // First add to valid users list
        const collection = await this.getCollection('users');
        const data = await collection.findOne({ _id: 'validUsers' });
        const existingUsers = data?.users || [];

        const filteredUsers = existingUsers.filter(
            u => u.toLowerCase() !== username.toLowerCase()
        );

        filteredUsers.push(username.trim());

        await collection.updateOne(
            { _id: 'validUsers' },
            { $set: { users: filteredUsers } },
            { upsert: true }
        );

        // Initialize user stats
        const stats = await this.getUserStats();
        const cleanUsername = username.trim().toLowerCase();
        const year = new Date().getFullYear().toString();

        if (!stats.users[cleanUsername]) {
            stats.users[cleanUsername] = {
                totalPoints: 0,
                yearlyPoints: {},
                monthlyAchievements: {},
                bonusPoints: [],
                completedGames: {},
                monthlyStats: {},
                yearlyStats: {},
                participationMonths: [],
                completionMonths: [],
                masteryMonths: [],
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

        if (!stats.users[cleanUsername].yearlyStats[year]) {
            stats.users[cleanUsername].yearlyStats[year] = {
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

        // Save the updated stats
        await this.saveUserStats(stats);
        console.log(`[DATABASE] Added and initialized user: ${username}`);
        
        return true;
    } catch (error) {
        ErrorHandler.logError(error, 'Add Valid User');
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


    async findUser(username) {
        try {
            const collection = await this.getCollection('users');
            const data = await collection.findOne({ _id: 'validUsers' });
            return data?.users?.find(u => u.toLowerCase() === username.toLowerCase()) || null;
        } catch (error) {
            ErrorHandler.logError(error, 'Find User');
            return null;
        }
    }

    async updateUserCase(oldUsername, newUsername) {
        try {
            if (oldUsername.toLowerCase() !== newUsername.toLowerCase()) {
                throw new Error('Cannot update case for different usernames');
            }

            const collection = await this.getCollection('users');
            const data = await collection.findOne({ _id: 'validUsers' });
            const users = data?.users || [];
            
            const index = users.findIndex(u => u.toLowerCase() === oldUsername.toLowerCase());
            if (index !== -1) {
                users[index] = newUsername;
                await collection.updateOne(
                    { _id: 'validUsers' },
                    { $set: { users: users } }
                );
                console.log(`[DATABASE] Updated username case from ${oldUsername} to ${newUsername}`);
                return true;
            }
            return false;
        } catch (error) {
            ErrorHandler.logError(error, 'Update User Case');
            throw error;
        }
    }

        async removeValidUser(username) {
        try {
            const collection = await this.getCollection('users');
            const data = await collection.findOne({ _id: 'validUsers' });
            const users = data?.users || [];
            
            // Filter case-insensitively
            const filteredUsers = users.filter(u => u.toLowerCase() !== username.toLowerCase());
            
            await collection.updateOne(
                { _id: 'validUsers' },
                { $set: { users: filteredUsers } }
            );

            console.log(`[DATABASE] Removed user: ${username}`);
        } catch (error) {
            ErrorHandler.logError(error, 'Remove Valid User');
            throw error;
        }
    }

    // ===================
    // Game Request Methods
    // ===================
    async requestNewGame(gameName, requestedBy) {
        const collection = await this.getCollection('gameRequests');
        await collection.updateOne(
            { _id: 'requests' },
            {
                $push: {
                    pending: {
                        gameName,
                        requestedBy,
                        requestDate: new Date().toISOString(),
                        status: 'pending'
                    }
                }
            },
            { upsert: true }
        );
    }

    async approveGame(gameName) {
        const collection = await this.getCollection('gameRequests');
        await collection.updateOne(
            { _id: 'requests' },
            {
                $pull: { pending: { gameName } },
                $push: {
                    approved: {
                        gameName,
                        approvedDate: new Date().toISOString()
                    }
                }
            }
        );
        return true;
    }

    async getGameRequests() {
        const collection = await this.getCollection('gameRequests');
        return await fetchData(collection, { _id: 'requests' }, {
            pending: [],
            approved: []
        });
    }

    // ====================
    // Configuration Methods
    // ====================
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

    async hasUserNominated(userId) {
        const collection = await this.getCollection('nominations');
        const status = await this.getNominationStatus();
        
        // If nominations aren't open, return false
        if (!status?.isOpen) return false;

        const currentPeriod = await collection.findOne({ _id: 'currentPeriod' });
        if (!currentPeriod) return false;

        const userNomination = await collection.findOne({
            _id: 'nominations',
            [`nominations.${currentPeriod.period}.userId`]: userId
        });

        return !!userNomination;
    }

    async addNomination(nomination) {
        const collection = await this.getCollection('nominations');
        const status = await this.getNominationStatus();
        
        if (!status?.isOpen) {
            throw new Error('Nominations are currently closed');
        }

        const currentPeriod = await collection.findOne({ _id: 'currentPeriod' });
        const period = currentPeriod?.period || new Date().toISOString().slice(0, 7); // YYYY-MM format

        await collection.updateOne(
            { _id: 'nominations' },
            {
                $push: {
                    [`nominations.${period}`]: nomination
                }
            },
            { upsert: true }
        );

        // Update current period if it doesn't exist
        if (!currentPeriod) {
            await collection.updateOne(
                { _id: 'currentPeriod' },
                { $set: { period } },
                { upsert: true }
            );
        }
    }

    async getNominations(period = null) {
        const collection = await this.getCollection('nominations');
        
        if (!period) {
            const currentPeriod = await collection.findOne({ _id: 'currentPeriod' });
            period = currentPeriod?.period || new Date().toISOString().slice(0, 7);
        }

        const nominations = await collection.findOne({ _id: 'nominations' });
        return nominations?.nominations?.[period] || [];
        
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
    // Community Records Methods
    // ===================
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
}

module.exports = new Database();

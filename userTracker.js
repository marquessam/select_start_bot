// userTracker.js
class UserTracker {
    constructor(database, userStats) {
        this.database = database;
        this.userStats = userStats;
        this.validUsers = new Map(); // Store lowercase -> original case mapping
    }

    extractUsername(url) {
        try {
            const patterns = [
                /retroachievements\.org\/user\/([^\/\s]+)/i,
                /ra\.org\/user\/([^\/\s]+)/i
            ];

            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match) return match[1]; // Return exact case from URL
            }
            return null;
        } catch (error) {
            console.error('[USER TRACKER] Error extracting username:', error);
            return null;
        }
    }

    async processMessage(message) {
        try {
            if (message.author.bot) return;

            const words = message.content.split(/\s+/);
            for (const word of words) {
                if (word.includes('retroachievements.org/user/') || 
                    word.includes('ra.org/user/')) {
                    const username = this.extractUsername(word);
                    if (username) {
                        const added = await this.addUser(username);
                        if (added) {
                            await message.react('✅');
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[USER TRACKER] Error processing message:', error);
        }
    }

    async addUser(username) {
        try {
            if (!username) {
                console.warn('[USER TRACKER] Attempted to add null/undefined username');
                return false;
            }

            const originalCase = username.trim();
            const lowercaseKey = originalCase.toLowerCase();

            if (!originalCase) {
                console.warn('[USER TRACKER] Attempted to add empty username');
                return false;
            }

            const validUsers = await this.database.getValidUsers();
            const existingUser = validUsers.find(u => u.toLowerCase() === lowercaseKey);

            if (!existingUser) {
                console.log(`[USER TRACKER] Adding new user: ${originalCase}`);

                await this.database.addValidUser(originalCase);
                this.validUsers.set(lowercaseKey, originalCase);

                if (this.userStats) {
                    console.log(`[USER TRACKER] Initializing stats for: ${originalCase}`);
                    await this.userStats.initializeUserIfNeeded(originalCase);
                } else {
                    console.warn('[USER TRACKER] UserStats not available for initialization');
                }

                if (global.leaderboardCache) {
                    console.log(`[USER TRACKER] Updating leaderboard cache for: ${originalCase}`);
                    await global.leaderboardCache.updateValidUsers();
                } else {
                    console.warn('[USER TRACKER] LeaderboardCache not available for update');
                }

                console.log(`[USER TRACKER] Successfully added user: ${originalCase}`);
                return true;
            } else if (existingUser !== originalCase) {
                console.log(`[USER TRACKER] Updating case for user from ${existingUser} to ${originalCase}`);
                await this.database.updateUserCase(existingUser, originalCase);
                this.validUsers.set(lowercaseKey, originalCase);
                return true;
            } else {
                console.log(`[USER TRACKER] User already exists: ${originalCase}`);
                return false;
            }
        } catch (error) {
            console.error('[USER TRACKER] Error adding user:', error);
            return false;
        }
    }

    async initialize() {
        try {
            console.log('[USER TRACKER] Initializing...');
            const users = await this.database.getValidUsers();

            this.validUsers.clear();
            for (const user of users) {
                this.validUsers.set(user.toLowerCase(), user);
            }

            if (this.userStats) {
                for (const [_, originalCase] of this.validUsers) {
                    await this.userStats.initializeUserIfNeeded(originalCase);
                }
            }

            console.log('[USER TRACKER] Initialized with', this.validUsers.size, 'users');
        } catch (error) {
            console.error('[USER TRACKER] Error initializing:', error);
            this.validUsers.clear();
        }
    }

    getValidUsers() {
        return Array.from(this.validUsers.values());
    }

    async removeUser(username) {
        try {
            const lowercaseKey = username.toLowerCase();
            const originalCase = this.validUsers.get(lowercaseKey);

            if (originalCase) {
                await this.database.removeValidUser(originalCase);
                this.validUsers.delete(lowercaseKey);

                if (this.userStats) {
                    await this.userStats.removeUser(originalCase);
                }

                if (global.leaderboardCache) {
                    await global.leaderboardCache.updateValidUsers();
                }

                console.log(`[USER TRACKER] Removed user: ${originalCase}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('[USER TRACKER] Error removing user:', error);
            return false;
        }
    }
}

module.exports = UserTracker;

// database.js
async addValidUser(username) {
    try {
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

        console.log(`[DATABASE] Added user with case preservation: ${username}`);
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

// userStats.js
class UserStats {
    async initializeUserIfNeeded(username) {
        const cleanUsername = username.trim().toLowerCase();
        if (!this.stats.users[cleanUsername]) {
            console.log(`Initializing stats for new user: ${cleanUsername}`);
            this.stats.users[cleanUsername] = {
                yearlyPoints: {},
                completedGames: {},
                monthlyAchievements: {},
                yearlyStats: {},
                participationMonths: [],
                completionMonths: [],
                masteryMonths: [],
                bonusPoints: []
            };
            await this.saveStats();
        }
    }

    async loadStats(userTracker) {
        const users = await userTracker.getValidUsers();
        for (const username of users) {
            await this.initializeUserIfNeeded(username);
        }
    }
}

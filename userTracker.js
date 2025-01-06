// userTracker.js
class UserTracker {
    constructor(database, userStats) {
        this.database = database;
        this.userStats = userStats;
        this.validUsers = new Set();
    }

    extractUsername(url) {
        try {
            const patterns = [
                /retroachievements\.org\/user\/([^\/\s]+)/i,
                /ra\.org\/user\/([^\/\s]+)/i
            ];

            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match) return match[1];
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

            const cleanUsername = username.trim().toLowerCase();
            if (!cleanUsername) {
                console.warn('[USER TRACKER] Attempted to add empty username');
                return false;
            }

            const validUsers = await this.database.getValidUsers();
            if (!validUsers.includes(cleanUsername)) {
                console.log(`[USER TRACKER] Adding new user: ${cleanUsername}`);
                
                // Add to database
                await this.database.addValidUser(cleanUsername);
                this.validUsers.add(cleanUsername);
                
                // Initialize user stats
                if (this.userStats) {
                    console.log(`[USER TRACKER] Initializing stats for: ${cleanUsername}`);
                    await this.userStats.initializeUserIfNeeded(cleanUsername);
                } else {
                    console.warn('[USER TRACKER] UserStats not available for initialization');
                }
                
                // Update leaderboard cache
                if (global.leaderboardCache) {
                    console.log(`[USER TRACKER] Updating leaderboard cache for: ${cleanUsername}`);
                    await global.leaderboardCache.updateValidUsers();
                } else {
                    console.warn('[USER TRACKER] LeaderboardCache not available for update');
                }

                console.log(`[USER TRACKER] Successfully added user: ${cleanUsername}`);
                return true;
            } else {
                console.log(`[USER TRACKER] User already exists: ${cleanUsername}`);
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
            this.validUsers = new Set(users.map(u => u.toLowerCase()));
            
            // Initialize stats for all users
            if (this.userStats) {
                for (const username of this.validUsers) {
                    await this.userStats.initializeUserIfNeeded(username);
                }
            }

            console.log('[USER TRACKER] Initialized with', this.validUsers.size, 'users');
        } catch (error) {
            console.error('[USER TRACKER] Error initializing:', error);
            this.validUsers = new Set();
        }
    }

    async scanHistoricalMessages(channel, limit = 100) {
        try {
            console.log(`[USER TRACKER] Scanning historical messages in ${channel.name}...`);
            const messages = await channel.messages.fetch({ limit });
            
            let processedCount = 0;
            let newUsersCount = 0;

            for (const message of messages.values()) {
                await this.processMessage(message);
                processedCount++;
            }
            
            console.log(`[USER TRACKER] Processed ${processedCount} messages, found ${newUsersCount} new users`);
            return { processedCount, newUsersCount };
        } catch (error) {
            console.error('[USER TRACKER] Error scanning historical messages:', error);
            return { processedCount: 0, newUsersCount: 0 };
        }
    }

    getValidUsers() {
        return Array.from(this.validUsers);
    }

    async removeUser(username) {
        try {
            const cleanUsername = username.toLowerCase();
            if (this.validUsers.has(cleanUsername)) {
                await this.database.removeValidUser(cleanUsername);
                this.validUsers.delete(cleanUsername);
                
                if (this.userStats) {
                    await this.userStats.removeUser(cleanUsername);
                }
                
                if (global.leaderboardCache) {
                    await global.leaderboardCache.updateValidUsers();
                }
                
                console.log(`[USER TRACKER] Removed user: ${cleanUsername}`);
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

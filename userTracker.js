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
                
                // Add to database with original case
                await this.database.addValidUser(originalCase);
                this.validUsers.set(lowercaseKey, originalCase);
                
                // Initialize user stats
                if (this.userStats) {
                    console.log(`[USER TRACKER] Initializing stats for: ${originalCase}`);
                    await this.userStats.initializeUserIfNeeded(originalCase);
                } else {
                    console.warn('[USER TRACKER] UserStats not available for initialization');
                }
                
                // Update leaderboard cache
                if (global.leaderboardCache) {
                    console.log(`[USER TRACKER] Updating leaderboard cache for: ${originalCase}`);
                    await global.leaderboardCache.updateValidUsers();
                } else {
                    console.warn('[USER TRACKER] LeaderboardCache not available for update');
                }

                console.log(`[USER TRACKER] Successfully added user: ${originalCase}`);
                return true;
            } else if (existingUser !== originalCase) {
                // Update case if it differs
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
            
            // Clear and rebuild the Map
            this.validUsers.clear();
            for (const user of users) {
                this.validUsers.set(user.toLowerCase(), user);
            }
            
            // Initialize stats for all users
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

    async scanHistoricalMessages(channel, limit = 100) {
        try {
            console.log(`[USER TRACKER] Scanning historical messages in ${channel.name}...`);
            const messages = await channel.messages.fetch({ limit });
            
            let processedCount = 0;
            let newUsersCount = 0;

            for (const message of messages.values()) {
                const initialSize = this.validUsers.size;
                await this.processMessage(message);
                if (this.validUsers.size > initialSize) {
                    newUsersCount++;
                }
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

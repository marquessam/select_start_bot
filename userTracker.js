class UserTracker {
    constructor(database, userStats) {
        this.database = database;
        this.userStats = userStats;
        this.validUsers = new Map(); // Store lowercase -> original case mapping
        this.cache = {
            lastUpdate: null,
            updateInterval: 5 * 60 * 1000, // 5 minutes
            profileUrlPattern: /(?:retroachievements\.org|ra\.org)\/user\/([^\/\s]+)/i
        };
    }

    async initialize() {
        try {
            console.log('[USER TRACKER] Initializing...');
            await this.refreshUserCache();
            return true;
        } catch (error) {
            console.error('[USER TRACKER] Error initializing:', error);
            this.validUsers.clear();
            return false;
        }
    }

    async refreshUserCache() {
        try {
            const users = await this.database.getValidUsers();
            
            this.validUsers.clear();
            for (const user of users) {
                this.validUsers.set(user.toLowerCase(), user);
            }

            this.cache.lastUpdate = Date.now();
            return true;
        } catch (error) {
            console.error('[USER TRACKER] Error refreshing cache:', error);
            return false;
        }
    }

    shouldRefreshCache() {
        return !this.cache.lastUpdate || 
               (Date.now() - this.cache.lastUpdate) > this.cache.updateInterval;
    }

    extractUsername(url) {
        try {
            const match = url.match(this.cache.profileUrlPattern);
            return match ? match[1] : null;
        } catch (error) {
            console.error('[USER TRACKER] Error extracting username:', error);
            return null;
        }
    }

    async processMessage(message) {
        if (message.author.bot) return;

        try {
            if (this.shouldRefreshCache()) {
                await this.refreshUserCache();
            }

            const words = message.content.split(/\s+/);
            let updatedAny = false;

            for (const word of words) {
                if (word.includes('retroachievements.org/user/') || 
                    word.includes('ra.org/user/')) {
                    const username = this.extractUsername(word);
                    if (username) {
                        const added = await this.addUser(username);
                        if (added) {
                            updatedAny = true;
                        }
                    }
                }
            }

            if (updatedAny) {
                await message.react('✅');
                await this.refreshUserCache(); // Refresh cache after changes
            }
        } catch (error) {
            console.error('[USER TRACKER] Error processing message:', error);
        }
    }

    async addUser(username) {
        try {
            if (!username) return false;

            const originalCase = username.trim();
            const lowercaseKey = originalCase.toLowerCase();

            if (!originalCase) return false;

            // Check cache first
            const existingUser = this.validUsers.get(lowercaseKey);

            if (!existingUser) {
                await this.database.manageUser('add', originalCase);
                this.validUsers.set(lowercaseKey, originalCase);

                if (this.userStats) {
                    await this.userStats.initializeUserIfNeeded(originalCase);
                }

                if (global.leaderboardCache) {
                    await global.leaderboardCache.updateValidUsers();
                }

                return true;
            } else if (existingUser !== originalCase) {
                await this.database.manageUser('update', existingUser, originalCase);
                this.validUsers.set(lowercaseKey, originalCase);
                return true;
            }

            return false;
        } catch (error) {
            console.error('[USER TRACKER] Error adding user:', error);
            return false;
        }
    }

    async scanHistoricalMessages(channel, limit = 100) {
        try {
            console.log(`[USER TRACKER] Scanning historical messages in ${channel.name}...`);
            const messages = await channel.messages.fetch({ limit });
            
            let processedCount = 0;
            let addedUsers = 0;

            for (const message of messages.values()) {
                const words = message.content.split(/\s+/);
                for (const word of words) {
                    if (word.includes('retroachievements.org/user/') || 
                        word.includes('ra.org/user/')) {
                        const username = this.extractUsername(word);
                        if (username) {
                            const added = await this.addUser(username);
                            if (added) addedUsers++;
                        }
                    }
                }
                processedCount++;
            }
            
            console.log(`[USER TRACKER] Processed ${processedCount} messages, found ${addedUsers} new users`);
            if (addedUsers > 0) {
                await this.refreshUserCache();
            }
        } catch (error) {
            console.error('[USER TRACKER] Error scanning historical messages:', error);
            throw error;
        }
    }

    async removeUser(username) {
        try {
            const lowercaseKey = username.toLowerCase();
            const originalCase = this.validUsers.get(lowercaseKey);

            if (originalCase) {
                await this.database.manageUser('remove', originalCase);
                this.validUsers.delete(lowercaseKey);

                if (this.userStats) {
                    await this.userStats.removeUser(originalCase);
                }

                if (global.leaderboardCache) {
                    await global.leaderboardCache.updateValidUsers();
                }

                return true;
            }
            return false;
        } catch (error) {
            console.error('[USER TRACKER] Error removing user:', error);
            return false;
        }
    }

    getValidUsers() {
        return Array.from(this.validUsers.values());
    }
}

module.exports = UserTracker;

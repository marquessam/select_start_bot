// userTracker.js
class UserTracker {
    constructor(database, userStats) {  // Add userStats parameter
        this.database = database;
        this.userStats = userStats;     // Store userStats reference
        this.validUsers = new Set();
    }

    // Extract username from RA URL
    extractUsername(url) {
        try {
            // Handle different URL formats
            const patterns = [
                /retroachievements\.org\/user\/([^\/\s]+)/i,  // Standard profile URL
                /ra\.org\/user\/([^\/\s]+)/i                  // Short URL format
            ];

            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match) return match[1];
            }
            return null;
        } catch (error) {
            console.error('Error extracting username:', error);
            return null;
        }
    }

    // Process a message to find RA URLs
    async processMessage(message) {
        try {
            // Ignore messages from bots
            if (message.author.bot) return;

            // Check if message contains URLs
            const words = message.content.split(/\s+/);
            for (const word of words) {
                if (word.includes('retroachievements.org/user/') || 
                    word.includes('ra.org/user/')) {
                    const username = this.extractUsername(word);
                    if (username) {
                        await this.addUser(username);
                        await message.react('✅');  // React to confirm processing
                    }
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    }

    // Add a new user to the tracking system
    async addUser(username) {
        try {
            const validUsers = await this.database.getValidUsers();
            if (!validUsers.includes(username.toLowerCase())) {
                await this.database.addValidUser(username);
                this.validUsers.add(username.toLowerCase());
                
                // Initialize stats for new user
                if (this.userStats) {
                    await this.userStats.initializeUserIfNeeded(username);
                }
                
                // Update leaderboard cache if it exists
                if (global.leaderboardCache) {
                    await global.leaderboardCache.updateValidUsers();
                    await global.leaderboardCache.updateLeaderboards();
                }
                
                console.log(`Added new user: ${username}`);
            }
        } catch (error) {
            console.error('Error adding user:', error);
        }
    }

    // Initialize tracker with existing users
    async initialize() {
        try {
            const users = await this.database.getValidUsers();
            this.validUsers = new Set(users.map(u => u.toLowerCase()));
            console.log('UserTracker initialized with', this.validUsers.size, 'users');
        } catch (error) {
            console.error('Error initializing UserTracker:', error);
        }
    }

    // Scan historical messages in a channel
    async scanHistoricalMessages(channel, limit = 100) {
        try {
            console.log(`Scanning historical messages in ${channel.name}...`);
            const messages = await channel.messages.fetch({ limit });
            
            let processedCount = 0;
            for (const message of messages.values()) {
                await this.processMessage(message);
                processedCount++;
            }
            
            console.log(`Processed ${processedCount} historical messages`);
        } catch (error) {
            console.error('Error scanning historical messages:', error);
        }
    }

    // Get current list of valid users
    getValidUsers() {
        return Array.from(this.validUsers);
    }
}

module.exports = UserTracker;

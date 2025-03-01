const { EmbedBuilder } = require('discord.js');
const raAPI = require('./raAPI');
const DataService = require('./services/dataService');
const database = require('./database');

class AchievementFeed {
    constructor(client) {
        this.client = client;
        this.feedChannel = process.env.ACHIEVEMENT_FEED_CHANNEL;
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        this.announcementHistory = new Set();
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isInitializing = false;
        this.initializationComplete = false;
        this._processingAchievements = false;
        this.isPaused = false;
        
        // For the URL character reveal
        this.secretUrl = "https://shadowgameboy.netlify.app/";
        this.urlCharacters = this.secretUrl.split('');
        this.revealedCharacters = new Set(); // Track which characters have been revealed
        this.characterRevealCount = 0;
        this.lastRevealedIndex = undefined; // Track last revealed character index for sequence
        this.services = null; // Will store service references
    }

    setServices(services) {
        this.services = services;
        console.log('[ACHIEVEMENT FEED] Services updated');
    }

    startPeriodicCheck() {
        setInterval(() => this.checkNewAchievements(), this.checkInterval);
    }

    async initialize() {
        if (this.isInitializing) {
            console.log('[ACHIEVEMENT FEED] Already initializing...');
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.isInitializing = true;
        try {
            console.log('[ACHIEVEMENT FEED] Initializing...');
            
            const [allAchievements, storedTimestamps] = await Promise.all([
                raAPI.fetchAllRecentAchievements(),
                database.getLastAchievementTimestamps()
            ]);

            for (const { username, achievements } of allAchievements) {
                if (achievements.length > 0 && !storedTimestamps[username.toLowerCase()]) {
                    const mostRecentTime = new Date(achievements[0].Date).getTime();
                    await database.updateLastAchievementTimestamp(username.toLowerCase(), mostRecentTime);
                }
            }

            this.initializationComplete = true;
            this.startPeriodicCheck();
            console.log('[ACHIEVEMENT FEED] Initialized successfully.');
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Initialization error:', error);
        } finally {
            this.isInitializing = false;
        }
    }

    async queueAnnouncement(messageOptions) {
        this.announcementQueue.push(messageOptions);
        if (!this.isProcessingQueue) {
            await this.processAnnouncementQueue();
        }
    }

    async processAnnouncementQueue() {
        if (this.isProcessingQueue || this.announcementQueue.length === 0) return;

        this.isProcessingQueue = true;
        try {
            const channel = await this.client.channels.fetch(this.feedChannel);
            while (this.announcementQueue.length > 0) {
                const messageOptions = this.announcementQueue.shift();
                await channel.send(messageOptions);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error processing announcements:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    async checkNewAchievements() {
        if (this._processingAchievements) {
            console.log('[ACHIEVEMENT FEED] Already processing, skipping...');
            return;
        }

        this._processingAchievements = true;
        try {
            const [allAchievements, storedTimestamps] = await Promise.all([
                raAPI.fetchAllRecentAchievements(),
                database.getLastAchievementTimestamps()
            ]);
            
            const channel = await this.client.channels.fetch(this.feedChannel);
            if (!channel) throw new Error('Achievement feed channel not found');

            for (const { username, achievements } of allAchievements) {
                if (!achievements || achievements.length === 0) continue;

                const lastCheckedTime = storedTimestamps[username.toLowerCase()] || 0;
                const newAchievements = achievements
                    .filter(a => new Date(a.Date).getTime() > lastCheckedTime)
                    .sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());

                if (newAchievements.length > 0) {
                    const latestTime = new Date(newAchievements[newAchievements.length - 1].Date).getTime();
                    await database.updateLastAchievementTimestamp(username.toLowerCase(), latestTime);

                    for (const achievement of newAchievements) {
                        await this.sendAchievementNotification(channel, username, achievement);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error checking achievements:', error);
        } finally {
            this._processingAchievements = false;
        }
    }

    async sendAchievementNotification(channel, username, achievement) {
        try {
            if (!channel || !username || !achievement) return;

            const achievementKey = `${username}-${achievement.ID}-${achievement.GameTitle}-${achievement.Title}`;
            if (this.announcementHistory.has(achievementKey)) return;

            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const userIconUrl = await DataService.getRAProfileImage(username) || 
                `https://retroachievements.org/UserPic/${username}.png`;

            // Special game handling with proper game IDs
            let authorName = '';
            let authorIconUrl = '';
            let files = [];
            let color = '#00FF00';  // Default color

            const gameId = String(achievement.GameID); // Ensure string comparison

            // Add the logo file for special games
            const logoFile = { 
                attachment: './assets/logo_simple.png',
                name: 'game_logo.png'
            };

            if (gameId === '7181' || gameId === '8181') { // Shadow Game - Monster Rancher Advance 2
                authorName = 'SHADOW GAME 🌘';
                files = [logoFile];
                authorIconUrl = 'attachment://game_logo.png';
                color = '#FFD700';  // Gold color
            } else if (gameId === '355') { // Monthly Challenge - ALTTP
                authorName = 'MONTHLY CHALLENGE 🏆';
                files = [logoFile];
                authorIconUrl = 'attachment://game_logo.png';
                color = '#00BFFF';  // Blue color
            } else if (gameId === '319') { // Chrono Trigger
                authorName = 'MONTHLY CHALLENGE 🏆';
                files = [logoFile];
                authorIconUrl = 'attachment://game_logo.png';
                color = '#00BFFF';  // Blue color
            } else if (gameId === '113355') { // Mega Man X5
                authorName = 'MONTHLY CHALLENGE 🏆';
                files = [logoFile];
                authorIconUrl = 'attachment://game_logo.png';
                color = '#00BFFF';  // Blue color
            }

            // Base elements for the achievement notification
            let gameTitle = achievement.GameTitle;
            let earnedText = `earned ${achievement.Title}`;
            let description = achievement.Description || 'No description available';
            let pointsText = `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`;

            // Check if we should include a character from the URL
            // If all characters have been revealed, reset and start over
            if (this.revealedCharacters.size >= this.secretUrl.length) {
                // Reset for a new cycle, but skip one achievement
                if (this.characterRevealCount % (this.secretUrl.length + 1) === this.secretUrl.length) {
                    // Skip this one (no character insertion)
                    this.characterRevealCount++;
                } else {
                    // Start a new cycle
                    this.revealedCharacters.clear();
                    this.characterRevealCount = 0;
                    this.lastRevealedIndex = undefined;
                }
            }

            // Only add a URL character if we're not on the skip position
            if (this.characterRevealCount % (this.secretUrl.length + 1) !== this.secretUrl.length) {
                // Get a random character that hasn't been revealed yet
                const availableChars = this.urlCharacters.filter(char => !this.revealedCharacters.has(char));
                
                // If we have characters left to reveal
                if (availableChars.length > 0) {
                    let characterToReveal;
                    
                    // 20% chance to reveal a sequential character if possible
                    if (Math.random() < 0.2 && this.lastRevealedIndex !== undefined) {
                        const nextIndex = this.lastRevealedIndex + 1;
                        // Try to reveal the next character in sequence if available
                        if (nextIndex < this.secretUrl.length && !this.revealedCharacters.has(this.urlCharacters[nextIndex])) {
                            characterToReveal = this.urlCharacters[nextIndex];
                            this.lastRevealedIndex = nextIndex;
                        } else {
                            // Fall back to random selection
                            const randomIndex = Math.floor(Math.random() * availableChars.length);
                            characterToReveal = availableChars[randomIndex];
                            this.lastRevealedIndex = this.urlCharacters.indexOf(characterToReveal);
                        }
                    } else {
                        // Random character selection
                        const randomIndex = Math.floor(Math.random() * availableChars.length);
                        characterToReveal = availableChars[randomIndex];
                        this.lastRevealedIndex = this.urlCharacters.indexOf(characterToReveal);
                    }
                    
                    // Mark this character as revealed
                    this.revealedCharacters.add(characterToReveal);
                    
                    // Choose a random position to insert the character
                    // Create a weighted distribution favoring the description for longer texts
                    const positionWeights = [
                        1,  // game title
                        1,  // earned text
                        2,  // description (higher weight = more likely)
                        1   // points text
                    ];
                    
                    let position = 0;
                    const weightSum = positionWeights.reduce((a, b) => a + b, 0);
                    let randomValue = Math.random() * weightSum;
                    
                    for (let i = 0; i < positionWeights.length; i++) {
                        randomValue -= positionWeights[i];
                        if (randomValue <= 0) {
                            position = i;
                            break;
                        }
                    }
                    
                    switch (position) {
                        case 0: // Add to game title
                            gameTitle = this.insertCharacterRandomly(gameTitle, characterToReveal);
                            break;
                        case 1: // Add to earned text
                            earnedText = this.insertCharacterRandomly(earnedText, characterToReveal);
                            break;
                        case 2: // Add to description
                            description = this.insertCharacterRandomly(description, characterToReveal);
                            break;
                        case 3: // Add to points text
                            pointsText = this.insertCharacterRandomly(pointsText, characterToReveal);
                            break;
                    }
                }
            }
            
            // Increment the counter for tracking where we are in the URL reveal sequence
            this.characterRevealCount++;
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(gameTitle)
                .setThumbnail(badgeUrl)
                .setDescription(`**${username}** ${earnedText}\n\n*${description}*`)
                .setFooter({ 
                    text: pointsText, 
                    iconURL: userIconUrl 
                })
                .setTimestamp();

            if (authorName) {
                embed.setAuthor({ name: authorName, iconURL: authorIconUrl });
            }

            await this.queueAnnouncement({ embeds: [embed], files });
            this.announcementHistory.add(achievementKey);

            if (this.services?.pointsManager) {
                await this.services.pointsManager.processNewAchievements(username, [achievement]);
            }
            
            if (this.announcementHistory.size > 1000) this.announcementHistory.clear();

        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error sending notification:', error);
        }
    }

    // Enhanced method to insert a character randomly into a string
    insertCharacterRandomly(text, character) {
        if (!text || text.length === 0) return text;
        
        // Special handling for URL structural characters to make them more noticeable
        const isSpecialChar = ['/', '.', ':', 'h', 't', 'p', 's'].includes(character);
        
        // Different insertion methods
        const insertionMethod = Math.floor(Math.random() * (isSpecialChar ? 3 : 5));
        
        switch (insertionMethod) {
            case 0: // Insert character with no space
                const position = Math.floor(Math.random() * text.length);
                return text.slice(0, position) + character + text.slice(position);
                
            case 1: // Add to beginning or end for special chars, more noticeable
                if (isSpecialChar) {
                    return Math.random() < 0.7 ? character + text : text + character;
                } else {
                    const replacePos = Math.floor(Math.random() * text.length);
                    return text.slice(0, replacePos) + character + text.slice(replacePos + 1);
                }
                
            case 2: // Add character with extra space around it for special chars
                if (isSpecialChar) {
                    return text + ' ' + character + ' ';
                } else {
                    const spacePos = text.lastIndexOf(' ');
                    if (spacePos === -1) {
                        return text + ' ' + character;
                    } else {
                        const insertAt = Math.floor(Math.random() * (spacePos + 1));
                        return text.slice(0, insertAt) + ' ' + character + text.slice(insertAt);
                    }
                }
                
            case 3: // Insert inside a word (for non-special chars)
                const words = text.split(' ');
                if (words.length > 0) {
                    const wordIndex = Math.floor(Math.random() * words.length);
                    const word = words[wordIndex];
                    if (word.length > 2) {
                        const charPos = Math.floor(Math.random() * (word.length - 1)) + 1;
                        words[wordIndex] = word.slice(0, charPos) + character + word.slice(charPos);
                    } else {
                        words[wordIndex] = word + character;
                    }
                    return words.join(' ');
                }
                return text + character;
                
            case 4: // Add at the beginning or end (for non-special chars)
                return Math.random() < 0.5 ? character + text : text + character;
                
            default:
                return text + character;
        }
    }

    async announcePointsAward(username, points, reason) {
        try {
            // Skip if feed is paused
            if (this.isPaused) {
                return;
            }

            if (!this.feedChannel) {
                console.warn('[ACHIEVEMENT FEED] No feedChannel configured for points announcements');
                return;
            }

            const awardKey = `${username}-${points}-${reason}-${Date.now()}`;
            if (this.announcementHistory.has(awardKey)) {
                console.log(`[ACHIEVEMENT FEED] Skipping duplicate points announcement: ${awardKey}`);
                return;
            }

            this.announcementHistory.add(awardKey);

            const userProfile = await DataService.getRAProfileImage(username);
            
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setAuthor({
                    name: username,
                    iconURL: userProfile || `https://retroachievements.org/UserPic/${username}.png`,
                    url: `https://retroachievements.org/user/${username}`
                })
                .setTitle('🏆 Points Awarded!')
                .setDescription(`**${username}** earned **${points} point${points !== 1 ? 's' : ''}**!\n*${reason}*`)
                .setTimestamp();

            await this.queueAnnouncement({ embeds: [embed] });

            console.log(`[ACHIEVEMENT FEED] Queued points announcement for ${username}: ${points} points (${reason})`);
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error announcing points award:', error);
            this.announcementHistory.delete(awardKey);
        }
    }

    // For testing URL reveal
    getSecretUrlStatus() {
        return {
            url: this.secretUrl,
            charactersRevealed: Array.from(this.revealedCharacters).join(''),
            count: this.characterRevealCount,
            progress: `${this.revealedCharacters.size}/${this.secretUrl.length} (${Math.floor(this.revealedCharacters.size / this.secretUrl.length * 100)}%)`
        };
    }

    resetUrlReveal() {
        this.revealedCharacters.clear();
        this.characterRevealCount = 0;
        this.lastRevealedIndex = undefined;
        return true;
    }
}

module.exports = AchievementFeed;
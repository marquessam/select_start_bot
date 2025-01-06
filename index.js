require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const database = require('./database');
const UserStats = require('./userStats');
const CommandHandler = require('./handlers/commandHandler');
const UserTracker = require('./userTracker');
const Announcer = require('./utils/announcer');
const createLeaderboardCache = require('./leaderboardCache');
const ShadowGame = require('./shadowGame');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

let services = null;  // Global services variable

async function initializeServices() {
    try {
        // Check for required environment variables
        if (!process.env.RA_CHANNEL_ID || !process.env.DISCORD_TOKEN || !process.env.ANNOUNCEMENT_CHANNEL_ID) {
            throw new Error('Missing environment variables. Please check .env file.');
        }

        // Initialize MongoDB
        await database.connect();
        console.log('MongoDB connected successfully');

        // Create instances in the correct order
        const userStats = new UserStats(database);
        const userTracker = new UserTracker(database, userStats);
        const leaderboardCache = createLeaderboardCache(database);
        const commandHandler = new CommandHandler();
        const announcer = new Announcer(client, userStats, process.env.ANNOUNCEMENT_CHANNEL_ID);
        const shadowGame = new ShadowGame();

        // Set up leaderboard cache
        leaderboardCache.setUserStats(userStats);
        global.leaderboardCache = leaderboardCache;

        // Initialize components one at a time with error handling
        try {
            await shadowGame.loadConfig();
            console.log('ShadowGame initialized.');
        } catch (error) {
            console.error('Error initializing ShadowGame:', error);
        }

        try {
            await userTracker.initialize();
            console.log('UserTracker initialized.');
        } catch (error) {
            console.error('Error initializing UserTracker:', error);
        }

        try {
            await userStats.loadStats(userTracker);
            console.log('UserStats loaded successfully.');
        } catch (error) {
            console.error('Error loading UserStats:', error);
        }

        try {
            await announcer.initialize();
            console.log('Announcer initialized.');
        } catch (error) {
            console.error('Error initializing Announcer:', error);
        }

        // Initialize UserTracker with RetroAchievements channel
        const raChannel = await client.channels.fetch(process.env.RA_CHANNEL_ID);
        if (!raChannel) {
            throw new Error('RA channel not found! Bot cannot proceed without a valid RA_CHANNEL_ID.');
        }

        console.log('Found RA channel, scanning historical messages...');
        try {
            await userTracker.scanHistoricalMessages(raChannel);
        } catch (error) {
            console.error('Error scanning historical messages:', error);
        }

        // Update leaderboards after all initializations
        try {
            await leaderboardCache.updateValidUsers();
            await leaderboardCache.updateLeaderboards();
            console.log('Leaderboard cache updated.');
        } catch (error) {
            console.error('Error updating leaderboard cache:', error);
        }

        // Load commands
        try {
            await commandHandler.loadCommands({ 
                shadowGame, 
                userStats, 
                announcer, 
                leaderboardCache,
                userTracker
            });
            console.log('Commands loaded:', Array.from(commandHandler.commands.keys()));
        } catch (error) {
            console.error('Error loading commands:', error);
        }

        const initializedServices = {
            userStats,
            userTracker,
            leaderboardCache,
            commandHandler,
            announcer,
            shadowGame
        };

        return initializedServices;
    } catch (error) {
        console.error('Initialization error:', error);
        throw error;
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        services = await initializeServices();
        console.log('Bot initialized successfully');
    } catch (error) {
        console.error('Fatal initialization error:', error);
        process.exit(1);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    try {
        if (!services) {
            console.warn('Services not yet initialized, ignoring message');
            return;
        }

        const { userTracker, shadowGame, commandHandler } = services;

        // Check for RA profile URLs if in the RA channel
        if (message.channel.id === process.env.RA_CHANNEL_ID && userTracker) {
            try {
                await userTracker.processMessage(message);
            } catch (error) {
                console.error('Error processing RA message:', error);
            }
        }

        // Process other bot functions
        if (shadowGame) {
            try {
                await shadowGame.checkMessage(message);
            } catch (error) {
                console.error('Error in shadow game processing:', error);
            }
        }

        if (commandHandler) {
            try {
                await commandHandler.handleCommand(message, services);
            } catch (error) {
                console.error('Error handling command:', error);
            }
        }
    } catch (error) {
        console.error('Message handling error:', error);
    }
});

// Set up periodic tasks
setInterval(() => {
    if (services?.leaderboardCache) {
        services.leaderboardCache.updateLeaderboards()
            .catch(error => console.error('Error updating leaderboards:', error));
    }
}, 60 * 60 * 1000); // Every hour

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await database.disconnect();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);

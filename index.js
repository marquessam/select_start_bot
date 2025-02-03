// index.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const database = require('./database');
const CommandHandler = require('./handlers/commandHandler');
const UserTracker = require('./userTracker');
const Announcer = require('./utils/announcer');
const createLeaderboardCache = require('./leaderboardCache');
const ShadowGame = require('./shadowGame');
const AchievementFeed = require('./achievementFeed');
const MobyAPI = require('./mobyAPI');
const AchievementSystem = require('./achievementSystem');

const REQUIRED_ENV_VARS = [
    'RA_CHANNEL_ID',
    'DISCORD_TOKEN',
    'ANNOUNCEMENT_CHANNEL_ID',
    'ACHIEVEMENT_FEED_CHANNEL'
];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
    ]
});

let services = null;

async function validateEnvironment() {
    const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
    if (missingVars.length > 0) {
        throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
    }
}

async function connectDatabase() {
    try {
        await database.connect();
        console.log('MongoDB connected successfully');
        return true;
    } catch (error) {
        console.error('Database Connection Error:', error);
        throw error;
    }
}

async function createCoreServices() {
    try {
        console.log('Creating core services...');
        
        // Create services
        const achievementSystem = new AchievementSystem(database);
        const userTracker = new UserTracker(database);
        const leaderboardCache = createLeaderboardCache(database);
        const commandHandler = new CommandHandler();
        const announcer = new Announcer(client, process.env.ANNOUNCEMENT_CHANNEL_ID);
        const shadowGame = new ShadowGame();
        const achievementFeed = new AchievementFeed(client);

        // Setup global references
        global.leaderboardCache = leaderboardCache;
        global.achievementFeed = achievementFeed;

        // Create services object with all required services
        const services = {
            achievementSystem,
            userTracker,
            leaderboardCache,
            commandHandler,
            announcer,
            shadowGame,
            achievementFeed,
            raAPI,   // Add raAPI service
            mobyAPI: MobyAPI,
            database // Add database service
        };

        // Initialize service dependencies
        achievementSystem.setServices(services);
        userTracker.setServices(services);
        leaderboardCache.setServices(services);
        achievementFeed.setServices(services);
        shadowGame.setServices(services);

        console.log('Core services created successfully');
        return services;
    } catch (error) {
        console.error('Error creating core services:', error);
        throw error;
    }
}

async function initializeServices(coreServices) {
    try {
        console.log('Initializing services...');

        await coreServices.userTracker.initialize();
        console.log('UserTracker initialized');

        await coreServices.shadowGame.initialize();
        console.log('ShadowGame initialized');

        await coreServices.announcer.initialize();
        console.log('Announcer initialized');

        await coreServices.commandHandler.loadCommands(coreServices);
        console.log('CommandHandler initialized');

        await coreServices.leaderboardCache.initialize(true);
        console.log('LeaderboardCache initialized');

        await coreServices.achievementFeed.initialize();
        console.log('AchievementFeed initialized');

        await coordinateUpdate(coreServices, true);

        console.log('All services initialized successfully');
        return coreServices;
    } catch (error) {
        console.error('Service Initialization Error:', error);
        throw error;
    }
}

async function setupBot() {
    try {
        await validateEnvironment();
        await connectDatabase();
        const coreServices = await createCoreServices();
        services = await initializeServices(coreServices);
        console.log('Bot setup completed successfully');
        return services;
    } catch (error) {
        console.error('Bot Setup Error:', error);
        throw error;
    }
}

async function coordinateUpdate(services, force = false) {
    if (!force && services.leaderboardCache.hasInitialData) {
        console.log('[UPDATE] Skipping redundant update, using cached data');
        return;
    }

    try {
        console.log('[UPDATE] Starting coordinated update...');
        
        if (!services?.leaderboardCache) {
            throw new Error('LeaderboardCache service not available');
        }

        await services.leaderboardCache.updateLeaderboards(force);
        services.leaderboardCache.hasInitialData = true;
        
        console.log('[UPDATE] Coordinated update complete');
    } catch (error) {
        console.error('[UPDATE] Error during coordinated update:', error);
    }
}

// Bot Event Handlers
client.once('ready', async () => {
    try {
        console.log(`Logged in as ${client.user.tag}`);
        await setupBot();
    } catch (error) {
        console.error('Fatal initialization error:', error);
        process.exit(1);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !services) return;

    try {
        // Process messages in the RA channel for user tracking
        if (message.channel.id === process.env.RA_CHANNEL_ID) {
            await services.userTracker.processMessage(message);
        }

        // Process shadow game messages
        await services.shadowGame.checkMessage(message);

        // Handle commands
        await services.commandHandler.handleCommand(message, services);
    } catch (error) {
        console.error('Message Handler Error:', error);
    }
});

// Periodic Updates
const UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes
setInterval(() => coordinateUpdate(services, true), UPDATE_INTERVAL);

// Graceful Shutdown
const shutdown = async (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    try {
        await database.disconnect();
        console.log('Cleanup completed');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
};

// Process Events
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    setTimeout(() => process.exit(1), 1000);
});
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

// Start Bot
client.login(process.env.DISCORD_TOKEN);

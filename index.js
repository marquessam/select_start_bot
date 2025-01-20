// index.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const database = require('./database');
const UserStats = require('./userStats');
const CommandHandler = require('./handlers/commandHandler');
const UserTracker = require('./userTracker');
const Announcer = require('./utils/announcer');
const createLeaderboardCache = require('./leaderboardCache');
const ShadowGame = require('./shadowGame');
const errorHandler = require('./utils/errorHandler');
const AchievementFeed = require('./achievementFeed');
const MobyAPI = require('./mobyAPI');

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
        GatewayIntentBits.GuildMessageReactions
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
        
        // Create services in specific order
        const userStats = new UserStats(database);
        const userTracker = new UserTracker(database, userStats);
        const leaderboardCache = createLeaderboardCache(database);
        const commandHandler = new CommandHandler();
        const announcer = new Announcer(client, userStats, process.env.ANNOUNCEMENT_CHANNEL_ID);
        const shadowGame = new ShadowGame();
        const achievementFeed = new AchievementFeed(client, database);

        // Set interdependencies
        leaderboardCache.setUserStats(userStats);
        global.leaderboardCache = leaderboardCache;
        global.achievementFeed = achievementFeed;

        console.log('Core services created successfully');
        return {
            userStats,
            userTracker,
            leaderboardCache,
            commandHandler,
            announcer,
            shadowGame,
            achievementFeed,
            mobyAPI: MobyAPI
        };
    } catch (error) {
        console.error('Error creating core services:', error);
        throw error;
    }
}

async function initializeServices(coreServices) {
    try {
        console.log('Initializing services...');

        // Do basic initialization first (no API calls)
        await coreServices.userTracker.initialize();
        console.log('UserTracker initialized');

        await coreServices.userStats.loadStats(coreServices.userTracker);
        console.log('UserStats initialized');

        await coreServices.shadowGame.loadConfig();
        console.log('ShadowGame initialized');

        await coreServices.announcer.initialize();
        console.log('Announcer initialized');

        await coreServices.commandHandler.loadCommands(coreServices);
        console.log('CommandHandler initialized');

        // Now do the heavy initialization with API calls - but only once
        await coreServices.leaderboardCache.initialize(true); // Skip initial API call
        console.log('LeaderboardCache initialized');

        await coreServices.achievementFeed.initialize();
        console.log('AchievementFeed initialized');

        // Do a single coordinated update at the end
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
    // If this is not forced and we've already got data, skip
    if (!force && services.leaderboardCache.hasInitialData) {
        console.log('[UPDATE] Skipping redundant update, using cached data');
        return;
    }

    console.log('[UPDATE] Starting coordinated update...');
    
    if (!services?.leaderboardCache || !services?.userStats) {
        console.log('[UPDATE] Required services not available');
        return;
    }

    try {
        // Wait for any pending operations to complete
        if (services.userStats.isInitializing || !services.userStats.initializationComplete) {
            console.log('[UPDATE] Waiting for UserStats initialization...');
            while (services.userStats.isInitializing || !services.userStats.initializationComplete) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Get fresh leaderboard data (includes achievements)
        const leaderboardData = await services.leaderboardCache.updateLeaderboards(force);
        console.log('[UPDATE] Leaderboard data updated');

        if (!leaderboardData?.leaderboard) {
            console.log('[UPDATE] No leaderboard data available');
            return;
        }

        // Process points and wait for completion
        await services.userStats.recheckAllPoints();
        console.log('[UPDATE] Points checked and processed');
        
        // Wait for any pending saves
        await services.userStats.saveStats();
        console.log('[UPDATE] Stats saved');

        // Mark that we have initial data
        services.leaderboardCache.hasInitialData = true;

        console.log('[UPDATE] Coordinated update complete');
    } catch (error) {
        console.error('[UPDATE] Error during coordinated update:', error);
    }
}

async function handleMessage(message, services) {
    const { userTracker, shadowGame, commandHandler } = services;
    const tasks = [];

    if (message.channel.id === process.env.RA_CHANNEL_ID) {
        tasks.push(userTracker.processMessage(message));
    }

    tasks.push(
        shadowGame.checkMessage(message),
        commandHandler.handleCommand(message, services)
    );

    await Promise.allSettled(tasks.map(task => 
        task.catch(error => console.error('Message handling error:', error))
    ));
}

// Bot Events
client.once('ready', async () => {
    try {
        console.log(`Logged in as ${client.user.tag}`);
        const initializedServices = await setupBot();
    } catch (error) {
        console.error('Fatal initialization error:', error);
        process.exit(1);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !services) return;
    await handleMessage(message, services).catch(error => 
        console.error('Message Handler Error:', error)
    );
});

// Periodic Updates
const UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes
setInterval(() => coordinateUpdate(services), UPDATE_INTERVAL);

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

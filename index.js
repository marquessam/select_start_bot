require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const database = require('./database');
const UserStats = require('./userStats');
const CommandHandler = require('./handlers/commandHandler');
const UserTracker = require('./userTracker');
const Announcer = require('./utils/announcer');
const createLeaderboardCache = require('./leaderboardCache');
const ShadowGame = require('./shadowGame');
const ErrorHandler = require('./utils/errorHandler');

const REQUIRED_ENV_VARS = ['RA_CHANNEL_ID', 'DISCORD_TOKEN', 'ANNOUNCEMENT_CHANNEL_ID'];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

let services = null;

async function validateEnvironment() {
    const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
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
        ErrorHandler.logError(error, 'Database Connection');
        throw error;
    }
}

async function createCoreServices() {
    try {
        const userStats = new UserStats(database);
        const userTracker = new UserTracker(database, userStats);
        const leaderboardCache = createLeaderboardCache(database);
        const commandHandler = new CommandHandler();
        const announcer = new Announcer(client, userStats, process.env.ANNOUNCEMENT_CHANNEL_ID);
        const shadowGame = new ShadowGame();

        // Set up leaderboard cache
        leaderboardCache.setUserStats(userStats);
        global.leaderboardCache = leaderboardCache;

        return {
            userStats,
            userTracker,
            leaderboardCache,
            commandHandler,
            announcer,
            shadowGame
        };
    } catch (error) {
        ErrorHandler.logError(error, 'Creating Core Services');
        throw error;
    }
}

async function initializeServices(coreServices) {
    const { userTracker, userStats, announcer, commandHandler, shadowGame, leaderboardCache } = coreServices;

    try {
        console.log('Initializing services...');

        // Initialize components in parallel
        await Promise.all([
            shadowGame.loadConfig()
                .catch(e => ErrorHandler.logError(e, 'Shadow Game Init')),
            userTracker.initialize()
                .catch(e => ErrorHandler.logError(e, 'User Tracker Init')),
            userStats.loadStats(userTracker)
                .catch(e => ErrorHandler.logError(e, 'User Stats Init')),
            announcer.initialize()
                .catch(e => ErrorHandler.logError(e, 'Announcer Init')),
            commandHandler.loadCommands(coreServices)
                .catch(e => ErrorHandler.logError(e, 'Command Handler Init')),
            leaderboardCache.initialize()
                .catch(e => ErrorHandler.logError(e, 'Leaderboard Cache Init'))
        ]);

        console.log('All services initialized successfully');
        return coreServices;
    } catch (error) {
        ErrorHandler.logError(error, 'Service Initialization');
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
    } catch (error) {
        ErrorHandler.logError(error, 'Bot Setup');
        throw error;
    }
}

async function handleMessage(message, services) {
    const { userTracker, shadowGame, commandHandler } = services;
    const tasks = [];

    if (message.channel.id === process.env.RA_CHANNEL_ID) {
        tasks.push(
            userTracker.processMessage(message)
                .catch(e => ErrorHandler.logError(e, 'User Tracker Message Processing'))
        );
    }

    tasks.push(
        shadowGame.checkMessage(message)
            .catch(e => ErrorHandler.logError(e, 'Shadow Game Message Check')),
        commandHandler.handleCommand(message, services)
            .catch(e => ErrorHandler.logError(e, 'Command Handler'))
    );

    await Promise.allSettled(tasks);
}

// Event Handlers
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
        await handleMessage(message, services);
    } catch (error) {
        ErrorHandler.logError(error, 'Message Handler');
    }
});

// Periodic Tasks
const updateLeaderboards = async () => {
    if (!services?.leaderboardCache) return;
    
    try {
        await services.leaderboardCache.updateLeaderboards();
    } catch (error) {
        ErrorHandler.logError(error, 'Leaderboard Update');
        // Retry in 5 minutes if failed
        setTimeout(updateLeaderboards, 5 * 60 * 1000);
    }
};

setInterval(updateLeaderboards, 60 * 60 * 1000); // Every hour

// Graceful Shutdown Handler
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

// Process Event Handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
    ErrorHandler.logError(error, 'Uncaught Exception');
    // Give time for error logging before exit
    setTimeout(() => process.exit(1), 1000);
});
process.on('unhandledRejection', (error) => {
    ErrorHandler.logError(error, 'Unhandled Rejection');
});

// Start the bot
client.login(process.env.DISCORD_TOKEN);

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

async function initializeCore() {
    await database.connect();
    const userStats = new UserStats(database);
    const userTracker = new UserTracker(database, userStats);
    const leaderboardCache = createLeaderboardCache(database);
    const commandHandler = new CommandHandler();
    const announcer = new Announcer(client, userStats, process.env.ANNOUNCEMENT_CHANNEL_ID);
    const shadowGame = new ShadowGame();

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
}

async function initializeServices(coreServices) {
    const { userTracker, userStats, announcer, commandHandler, shadowGame } = coreServices;

    const initTasks = [
        shadowGame.loadConfig().catch(e => ErrorHandler.logError(e, 'Shadow Game Init')),
        userTracker.initialize().catch(e => ErrorHandler.logError(e, 'User Tracker Init')),
        userStats.loadStats(userTracker).catch(e => ErrorHandler.logError(e, 'User Stats Init')),
        announcer.initialize().catch(e => ErrorHandler.logError(e, 'Announcer Init')),
        commandHandler.loadCommands(coreServices).catch(e => ErrorHandler.logError(e, 'Command Handler Init'))
    ];

    await Promise.allSettled(initTasks);
    return coreServices;
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

    await Promise.allSettled(tasks);
}

client.once('ready', async () => {
    try {
        await validateEnvironment();
        const coreServices = await initializeCore();
        services = await initializeServices(coreServices);
        console.log(`Bot initialized and logged in as ${client.user.tag}`);
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

// Optimize periodic tasks with error recovery
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

// Graceful shutdown
const shutdown = async () => {
    console.log('Shutting down gracefully...');
    try {
        await database.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
    ErrorHandler.logError(error, 'Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
    ErrorHandler.logError(error, 'Uncaught Exception');
    // Give time for error logging before exit
    setTimeout(() => process.exit(1), 1000);
});

client.login(process.env.DISCORD_TOKEN);

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
const PointsManager = require('./managers/pointsManager');

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
        const pointsManager = new PointsManager(database);
        const userStats = new UserStats(database, { pointsManager });  // Pass pointsManager here
        const userTracker = new UserTracker(database, userStats);
        const leaderboardCache = createLeaderboardCache(database);
        const commandHandler = new CommandHandler();
        const announcer = new Announcer(client, userStats, process.env.ANNOUNCEMENT_CHANNEL_ID);
        const shadowGame = new ShadowGame();
        const achievementFeed = new AchievementFeed(client, database);

        // Setup global references
        leaderboardCache.setUserStats(userStats);
        global.leaderboardCache = leaderboardCache;
        global.achievementFeed = achievementFeed;

        // Create services object
        const services = {
            pointsManager,
            userStats,
            userTracker,
            leaderboardCache,
            commandHandler,
            announcer,
            shadowGame,
            achievementFeed,
            mobyAPI: MobyAPI
        };

        // Pass services back to pointsManager and userStats
        pointsManager.setServices(services);
        userStats.setServices(services);

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

        // Initialize Points System first
        console.log('Initializing Points System...');
        console.log('Points System initialized');

        await coreServices.userTracker.initialize();
        console.log('UserTracker initialized');

        await coreServices.userStats.loadStats(coreServices.userTracker);
        console.log('UserStats initialized');

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

async function waitForUserStatsInitialization(userStats) {
    if (!userStats.isInitializing && userStats.initializationComplete) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const timer = setInterval(() => {
            if (!userStats.isInitializing && userStats.initializationComplete) {
                clearInterval(timer);
                resolve();
            }
        }, 100);
    });
}

async function coordinateUpdate(services, force = false) {
    // Check if an update is already in progress
    if (services._updating) {
        console.log('[UPDATE] Update already in progress, skipping');
        return;
    }
    
    // Set updating flag to prevent recursive calls
    services._updating = true;
    
    try {
        if (!force && services.leaderboardCache.hasInitialData) {
            console.log('[UPDATE] Skipping redundant update, using cached data');
            services._updating = false;
            return;
        }

        // Add time-based throttling
        const now = Date.now();
        const lastUpdate = services?.leaderboardCache?.getLastUpdated() || 0;
        
        if (!force && (now - lastUpdate) < 15 * 60 * 1000) { // 15 minutes minimum between updates
            console.log('[UPDATE] Skipping update, last update was too recent');
            services._updating = false;
            return;
        }

        console.log('[UPDATE] Starting coordinated update...');
        
        if (!services?.leaderboardCache || !services?.userStats) {
            console.log('[UPDATE] Required services not available');
            services._updating = false;
            return;
        }

        try {
            if (services.userStats.isInitializing || !services.userStats.initializationComplete) {
                console.log('[UPDATE] Waiting for UserStats initialization...');
                await waitForUserStatsInitialization(services.userStats);
            }

            const leaderboardData = await services.leaderboardCache.updateLeaderboards(force);
            console.log('[UPDATE] Leaderboard data updated');

            if (!leaderboardData?.leaderboard) {
                console.log('[UPDATE] No leaderboard data available');
                services._updating = false;
                return;
            }

            // Pass the already fetched leaderboard data to recheckAllPoints
            // Only recheck points once per day unless forced
            const lastPointsCheck = services.userStats.lastPointsCheck || 0;
            if (force || (now - lastPointsCheck) > 24 * 60 * 60 * 1000) { // Once per day
                // IMPORTANT: Pass the already fetched leaderboard data to avoid another fetch
                await services.userStats.recheckAllPoints(null, leaderboardData);
                services.userStats.lastPointsCheck = now;
                console.log('[UPDATE] Points checked and processed');
            } else {
                console.log('[UPDATE] Skipping points recheck, last check was too recent');
            }
            
            await services.userStats.saveStats();
            console.log('[UPDATE] Stats saved');

            services.leaderboardCache.hasInitialData = true;
            console.log('[UPDATE] Coordinated update complete');
        } catch (error) {
            console.error('[UPDATE] Error during coordinated update:', error);
        }
    } finally {
        // Always clear the updating flag when done
        services._updating = false;
    }
}
async function handleMessage(message, services) {
    if (message.author.bot || !services) return;
    
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
        
        // Make database available to commands via client
        client.database = database;
        console.log('Database attached to client for command access');
        
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
const UPDATE_INTERVAL = 30 * 60 * 1000; // 30 minutes (increased from 10 minutes)
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

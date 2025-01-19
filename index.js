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
    'ACHIEVEMENT_FEED_CHANNEL',
    'MOBYGAMES_API_KEY',
    'MOBYGAMES_API_URL'
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

// Store service references
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
        
        const userStats = new UserStats(database);
        const userTracker = new UserTracker(database, userStats);
        const leaderboardCache = createLeaderboardCache(database);
        const commandHandler = new CommandHandler();
        const announcer = new Announcer(client, userStats, process.env.ANNOUNCEMENT_CHANNEL_ID);
        const shadowGame = new ShadowGame();
        
        // Check if AchievementFeed is a class or object
        console.log('Achievement Feed type:', typeof AchievementFeed);
        let achievementFeed;
        if (typeof AchievementFeed === 'function') {
            achievementFeed = new AchievementFeed(client, database);
        } else {
            achievementFeed = AchievementFeed;
        }

        // Set up leaderboard cache
        leaderboardCache.setUserStats(userStats);
        global.leaderboardCache = leaderboardCache;

        // Set global achievement feed for point announcements
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
    const {
        userTracker,
        userStats,
        announcer,
        commandHandler,
        shadowGame,
        leaderboardCache,
        achievementFeed
    } = coreServices;

    try {
        console.log('Initializing services...');

        const initPromises = [];
        
        if (shadowGame?.loadConfig) initPromises.push(shadowGame.loadConfig().catch(e => console.error('Shadow Game Init Error:', e)));
        if (userTracker?.initialize) initPromises.push(userTracker.initialize().catch(e => console.error('User Tracker Init Error:', e)));
        if (userStats?.loadStats) initPromises.push(userStats.loadStats(userTracker).catch(e => console.error('User Stats Init Error:', e)));
        if (announcer?.initialize) initPromises.push(announcer.initialize().catch(e => console.error('Announcer Init Error:', e)));
        if (commandHandler?.loadCommands) initPromises.push(commandHandler.loadCommands(coreServices).catch(e => console.error('Command Handler Init Error:', e)));
        if (leaderboardCache?.initialize) initPromises.push(leaderboardCache.initialize().catch(e => console.error('Leaderboard Cache Init Error:', e)));
        if (achievementFeed?.initialize) initPromises.push(achievementFeed.initialize().catch(e => console.error('Achievement Feed Init Error:', e)));

        await Promise.all(initPromises);

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

async function performInitialParticipationCheck(services) {
    try {
        console.log('Performing initial participation and achievement check...');
        
        if (services?.leaderboardCache) {
            console.log('Fetching initial leaderboard data...');
            const leaderboardData = await services.leaderboardCache.updateLeaderboards(true);
            
            if (services?.userStats && leaderboardData) {
                console.log('Processing participation and beaten status...');
                await services.userStats.updateMonthlyParticipation(leaderboardData);
                console.log('Initial participation check completed');
            } else {
                console.warn('UserStats service or leaderboard data not available');
            }
        } else {
            console.warn('LeaderboardCache service not available');
        }
    } catch (error) {
        console.error('Error in initial participation check:', error);
    }
}

async function handleMessage(message, services) {
    const { userTracker, shadowGame, commandHandler } = services;
    const tasks = [];

    if (message.channel.id === process.env.RA_CHANNEL_ID) {
        tasks.push(
            userTracker.processMessage(message).catch(e => 
                console.error('User Tracker Message Processing Error:', e)
            )
        );
    }

    tasks.push(
        shadowGame.checkMessage(message).catch(e => 
            console.error('Shadow Game Message Check Error:', e)
        ),
        commandHandler.handleCommand(message, services).catch(e => 
            console.error('Command Handler Error:', e)
        )
    );

    await Promise.allSettled(tasks);
}

// Bot Events
client.once('ready', async () => {
    try {
        console.log(`Logged in as ${client.user.tag}`);
        const initializedServices = await setupBot();
        
        // Perform initial participation check after setup
        await performInitialParticipationCheck(initializedServices);
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
        console.error('Message Handler Error:', error);
    }
});

// Periodic Tasks
const updateLeaderboards = async () => {
    if (!services?.leaderboardCache) return;

    try {
        const leaderboardData = await services.leaderboardCache.updateLeaderboards(true);
        
        // Check participation after each leaderboard update
        if (services?.userStats && leaderboardData) {
            await services.userStats.updateMonthlyParticipation(leaderboardData);
        }
    } catch (error) {
        console.error('Leaderboard Update Error:', error);
        setTimeout(updateLeaderboards, 5 * 60 * 1000);
    }
};

// Run leaderboard updates every hour
setInterval(updateLeaderboards, 60 * 60 * 1000);

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

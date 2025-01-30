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
const TerminalEmbed = require('./utils/embedBuilder');

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
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
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
        
        const userStats = new UserStats(database);
        const userTracker = new UserTracker(database, userStats);
        const leaderboardCache = createLeaderboardCache(database);
        const commandHandler = new CommandHandler();
        const announcer = new Announcer(client, userStats, process.env.ANNOUNCEMENT_CHANNEL_ID);
        const shadowGame = new ShadowGame();
        const achievementFeed = new AchievementFeed(client, database);

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

/**
 * Waits (non-blocking) for userStats to finish initializing.
 * Returns immediately if already initialized, otherwise polls
 * every 100ms until initialization is complete.
 */
function waitForUserStatsInitialization(userStats) {
    // If already initialized, no need to wait
    if (!userStats.isInitializing && userStats.initializationComplete) {
        return Promise.resolve();
    }

    // Poll every 100ms until ready
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
        // Instead of while-loop blocking, we wait with a small helper
        if (services.userStats.isInitializing || !services.userStats.initializationComplete) {
            console.log('[UPDATE] Waiting for UserStats initialization...');
            await waitForUserStatsInitialization(services.userStats);
        }

        const leaderboardData = await services.leaderboardCache.updateLeaderboards(force);
        console.log('[UPDATE] Leaderboard data updated');

        if (!leaderboardData?.leaderboard) {
            console.log('[UPDATE] No leaderboard data available');
            return;
        }

        await services.userStats.recheckAllPoints();
        console.log('[UPDATE] Points checked and processed');
        
        await services.userStats.saveStats();
        console.log('[UPDATE] Stats saved');

        services.leaderboardCache.hasInitialData = true;
        console.log('[UPDATE] Coordinated update complete');
    } catch (error) {
        console.error('[UPDATE] Error during coordinated update:', error);
    }
}

async function handleMessage(message, services) {
    // Add debug logs
    console.log('Message received:', {
        isDM: !message.guild,
        channelType: message.channel.type,
        content: message.content,
        author: message.author.tag
    });
    const { userTracker, shadowGame, commandHandler } = services;
    const tasks = [];

    const isDM = !message.guild;

    if (isDM && !message.author.bot) {
        console.log('Processing DM message');  // Debug log
        // Check for first-time DM interaction
        const hasInteracted = await message.channel.messages.fetch({ limit: 2 })
            .then(messages => messages.size > 1)
            .catch(() => true);

        if (!hasInteracted) {
            const embed = new TerminalEmbed()
                .setTerminalTitle('SELECT START BOT - DIRECT MESSAGES')
                .setTerminalDescription(
                    '[WELCOME TO SELECT START BOT]\n' +
                    'You can use several commands directly in DMs for quick access to information.'
                )
                .addTerminalField('AVAILABLE DM COMMANDS',
                    '!profile <username> - Check RetroAchievements stats\n' +
                    '!leaderboard - View challenge rankings\n' +
                    '!challenge - See current monthly challenge\n' +
                    '!search <game> - Look up game information\n' +
                    '!nominations - View/submit game nominations\n' +
                    '!review - Read/write game reviews\n' +
                    '!help - Show all available commands'
                )
                .addTerminalField('IMPORTANT NOTE',
                    'Achievement announcements and point updates will still appear in the server\'s bot terminal channel.\n\n' +
                    'DMs are for quick access to information and submissions only.'
                )
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type any command to begin\n[Ready for input]█\x1b[0m```');
        }
    }

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

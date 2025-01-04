require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const database = require('./database');
const UserStats = require('./userStats');
const CommandHandler = require('./handlers/commandHandler');
const UserTracker = require('./userTracker');
const Announcer = require('./utils/announcer');
const leaderboardCache = require('./leaderboardCache');
const ShadowGame = require('./shadowGame');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

const userStats = new UserStats();
const commandHandler = new CommandHandler();
const announcer = new Announcer(client, userStats, process.env.ANNOUNCEMENT_CHANNEL_ID);
const shadowGame = new ShadowGame();
const userTracker = new UserTracker(database);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        // Check for required environment variables
        if (!process.env.RA_CHANNEL_ID || !process.env.DISCORD_TOKEN || !process.env.ANNOUNCEMENT_CHANNEL_ID) {
            console.error('Missing environment variables. Please check .env file.');
            process.exit(1);
        }

        // Initialize MongoDB
        await database.connect();
        console.log('MongoDB connected successfully');

        // Initialize components
        await shadowGame.loadConfig();
        console.log('ShadowGame initialized.');
        await userStats.loadStats(userTracker);
        console.log('UserStats loaded successfully.');
        await announcer.initialize();
        console.log('Announcer initialized.');
        await userTracker.initialize();
        console.log('UserTracker initialized.');

        // Initialize UserTracker with RetroAchievements channel
        const raChannel = await client.channels.fetch(process.env.RA_CHANNEL_ID);
        if (raChannel) {
            console.log('Found RA channel, scanning historical messages...');
            await userTracker.scanHistoricalMessages(raChannel);
        } else {
            console.error('RA channel not found! Bot cannot proceed without a valid RA_CHANNEL_ID.');
            process.exit(1);
        }

        // Set up leaderboard cache
        leaderboardCache.setUserStats(userStats);
        leaderboardCache.updateLeaderboards();
        console.log('Leaderboard cache updated.');

        // Load commands
        await commandHandler.loadCommands({ 
            shadowGame, 
            userStats, 
            announcer, 
            leaderboardCache,
            userTracker
        });
        console.log('Commands loaded:', Array.from(commandHandler.commands.keys()));
        console.log('Bot initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    try {
        console.log('Received message:', message.content);

        // Check for RA profile URLs if in the RA channel
        if (message.channel.id === process.env.RA_CHANNEL_ID) {
            await userTracker.processMessage(message);
        }

        // Process other bot functions
        if (shadowGame) {
            await shadowGame.checkMessage(message);
        }

        await commandHandler.handleCommand(message, { 
            shadowGame, 
            userStats, 
            announcer, 
            leaderboardCache,
            userTracker
        });
    } catch (error) {
        console.error('Message handling error:', error);
    }
});

// Set up periodic tasks
setInterval(() => {
    leaderboardCache.updateLeaderboards();
}, 60 * 60 * 1000); // Every hour

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await database.disconnect();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);


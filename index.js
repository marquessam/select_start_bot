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
        // Initialize MongoDB
        await database.connect();
        console.log('MongoDB connected successfully');

        // Initialize components
        await shadowGame.loadConfig();
        await userStats.loadStats();
        await announcer.initialize();
        await userTracker.initialize();

        // Initialize UserTracker with RetroAchievements channel
        const raChannel = await client.channels.fetch(process.env.RA_CHANNEL_ID);
        if (raChannel) {
            console.log('Found RA channel, scanning historical messages...');
            await userTracker.scanHistoricalMessages(raChannel);
        } else {
            console.error('RA channel not found! Check RA_CHANNEL_ID in .env');
        }

        // Set up leaderboard cache
        leaderboardCache.setUserStats(userStats);
        leaderboardCache.updateLeaderboards();

        // Load commands
        await commandHandler.loadCommands({ 
            shadowGame, 
            userStats, 
            announcer, 
            leaderboardCache,
            userTracker // Add userTracker to dependencies
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
            userTracker // Add userTracker to dependencies
        });
    } catch (error) {
        console.error('Message handling error:', error);
    }
});

// Set up periodic tasks
setInterval(() => {
    leaderboardCache.updateLeaderboards();
}, 60 * 60 * 1000); // Every hour

client.login(process.env.DISCORD_TOKEN);

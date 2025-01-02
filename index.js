const fs = require('fs');
const path = require('path');
const leaderboardCache = require('./leaderboardCache');
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const ShadowGame = require('./shadowGame.js');
const UserStats = require('./userStats.js');
const CommandHandler = require('./handlers/commandHandler.js');
const Announcer = require('./utils/announcer');
const database = require('./database');

// Create client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

let shadowGame;
const userStats = new UserStats();
const commandHandler = new CommandHandler();
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;

// Initialize leaderboard cache with error handling
setInterval(() => {
    try {
        leaderboardCache.updateLeaderboards();
    } catch (error) {
        console.error('Error updating leaderboard cache:', error);
    }
}, 60 * 60 * 1000); // Update every hour

// Initial leaderboard cache update
try {
    leaderboardCache.updateLeaderboards();
} catch (error) {
    console.error('Error during initial leaderboard cache update:', error);
}

// Debug logs at startup
console.log('=== DEBUG START ===');
console.log('Current directory:', __dirname);
console.log('Directory contents:', fs.readdirSync(__dirname));
if (fs.existsSync(path.join(__dirname, 'commands'))) {
    console.log('Commands directory contents:', fs.readdirSync(path.join(__dirname, 'commands')));
} else {
    console.log('Commands directory not found!');
}

// Create announcer after client is initialized
const announcer = new Announcer(client, userStats, ANNOUNCEMENT_CHANNEL_ID);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        // Initialize MongoDB connection
        await database.connect();
        console.log('MongoDB connected successfully');

        // Initialize bot components
        shadowGame = new ShadowGame();
        await shadowGame.loadConfig();
        await userStats.loadStats();
        await announcer.initialize();

        // Load commands with dependencies
        await commandHandler.loadCommands({
            shadowGame,
            userStats,
            announcer
        });

        console.log('Command handler initialized with commands:', Array.from(commandHandler.commands.keys()));
        console.log('Bot initialized successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    try {
        console.log('Message received:', message.content);

        // Only check shadow game if it was initialized successfully
        if (shadowGame) {
            await shadowGame.checkMessage(message);
        }

        // Handle commands
        await commandHandler.handleCommand(message, {
            shadowGame,
            userStats,
            announcer
        });
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('Shutting down bot...');

    try {
        // Disconnect database and destroy client
        await database.disconnect();
        client.destroy();
        console.log('Bot shut down successfully');
    } catch (error) {
        console.error('Error during shutdown:', error);
    } finally {
        process.exit(0);
    }
});

client.login(process.env.DISCORD_TOKEN);

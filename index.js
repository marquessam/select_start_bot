require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const database = require('./database');
const UserStats = require('./userStats');
const CommandHandler = require('./handlers/commandHandler');
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

const userStats = new UserStats(); // Ensure it's only instantiated here
const commandHandler = new CommandHandler();
const announcer = new Announcer(client, userStats, process.env.ANNOUNCEMENT_CHANNEL_ID);
const shadowGame = new ShadowGame();

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
        leaderboardCache.setUserStats(userStats); // Pass `userStats` to leaderboardCache
        leaderboardCache.updateLeaderboards(); // Initial leaderboard update

        // Load commands
        await commandHandler.loadCommands({ shadowGame, userStats, announcer, leaderboardCache });
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

        if (shadowGame) {
            await shadowGame.checkMessage(message);
        }

        await commandHandler.handleCommand(message, { shadowGame, userStats, announcer, leaderboardCache });
    } catch (error) {
        console.error('Message handling error:', error);
    }
});

setInterval(() => {
    leaderboardCache.updateLeaderboards(); // Periodic leaderboard update
}, 60 * 60 * 1000); // Every hour

client.login(process.env.DISCORD_TOKEN);

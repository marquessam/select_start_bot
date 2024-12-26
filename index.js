require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const ShadowGame = require('./shadowGame.js');
const UserStats = require('./userStats.js');
const CommandHandler = require('./handlers/commandHandler.js');

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

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        shadowGame = new ShadowGame();
        await shadowGame.loadConfig();
        await userStats.loadStats();

        // Load commands with dependencies
        await commandHandler.loadCommands({
            shadowGame,
            userStats
        });

        console.log('Bot initialized successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Check for shadow game solutions
    await shadowGame.checkMessage(message);

    // Handle commands
    await commandHandler.handleCommand(message, {
        shadowGame,
        userStats
    });
});

client.login(process.env.DISCORD_TOKEN);


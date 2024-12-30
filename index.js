require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const ShadowGame = require('./shadowGame.js');
const UserStats = require('./userStats.js');
const CommandHandler = require('./handlers/commandHandler.js');
const Announcer = require('./utils/announcer');
const database = require('./database');

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
       userStats,
       announcer
   });
});

client.login(process.env.DISCORD_TOKEN);

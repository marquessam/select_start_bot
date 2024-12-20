require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// When the bot is ready, log it to the console
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Basic message handler
client.on('messageCreate', async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Basic command handling
    if (message.content === '!ping') {
        await message.reply('Pong!');
    }
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);

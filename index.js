require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

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

    // Challenge command
    if (message.content === '!challenge') {
        const embed = new EmbedBuilder()
            .setColor('#5c3391')
            .setTitle('December 2024 Challenge')
            .setDescription('Final Fantasy Tactics: The War of the Lions');
            
        await message.reply({ embeds: [embed] });
    }
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);

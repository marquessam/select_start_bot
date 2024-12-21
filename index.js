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
  // Challenge command
    if (message.content === '!challenge') {
        // First send a console-style prefix
        await message.channel.send('```ansi\n\x1b[32m> Accessing challenge database...\x1b[0m\n```');

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('████ SELECT START MONTHLY CHALLENGE ████')
            .setDescription('```ansi\n\x1b[32m[CHALLENGE STATUS: ACTIVE]\n[PERIOD: 12.01.2024 - 12.31.2024]\x1b[0m```')
            .addFields(
                { 
                    name: '`MISSION`', 
                    value: '```\nComplete achievements in Final Fantasy Tactics: The War of the Lions```' 
                },
                { 
                    name: '`PARAMETERS`', 
                    value: '```\n- Hardcore mode required\n- All achievements eligible\n- Progress tracked via RetroAchievements.org\n- Multiplayer tiebreaker system active```' 
                }
            );
            
        await message.channel.send({ embeds: [embed] });

        // Send a follow-up console prompt
        await message.channel.send('```ansi\n\x1b[32m> Use !leaderboard to view current rankings...\x1b[0m█\n```');
    }
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { fetchLeaderboardData } = require('./raAPI.js');

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
        // First send a console-style prefix
        await message.channel.send('```ansi\n\x1b[32m> Accessing challenge database...\x1b[0m\n```');

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('████ SELECT START MONTHLY CHALLENGE ████')
            .setURL('https://retroachievements.org/game/3236')  // Link to game page
            .setThumbnail('https://media.retroachievements.org/Images/074335.png')  // Game icon
            .setDescription('```ansi\n\x1b[32m[CHALLENGE STATUS: ACTIVE]\n[PERIOD: 12.01.2024 - 12.31.2024]\x1b[0m```')
            .addFields(
                { 
                    name: '`MISSION`', 
                    value: '```\nComplete achievements in Final Fantasy Tactics: The War of the Lions```' 
                },
                { 
                    name: '`PARAMETERS`', 
                    value: '```\n- Hardcore mode required\n- All achievements eligible\n- Progress tracked via RetroAchievements.org\n- Multiplayer tiebreaker system active```' 
                },
                {
                    name: '`REWARD STRUCTURE`',
                    value: '```\n🥇 First Place: 10 points\n🥈 Second Place: 6 points\n🥉 Third Place: 3 points\n⭐ Bonus achievements may award additional points```'
                }
            )
            .setFooter({ 
                text: '[TERMINAL SESSION: SS-012024]' 
            })
            .setTimestamp();
            
        await message.channel.send({ embeds: [embed] });

        // Send a follow-up console prompt
        await message.channel.send('```ansi\n\x1b[32m> Use !leaderboard to view current rankings...\x1b[0m█\n```');
    }
    if (message.content === '!leaderboard') {
    try {
        // Send initial message
        await message.channel.send('```ansi\n\x1b[32m> Accessing leaderboard data...\x1b[0m\n```');
        
        // Fetch the data
        const data = await fetchLeaderboardData('3236');
        
        // Create the embed
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('████ CURRENT RANKINGS ████')
            .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
            .setDescription('```ansi\n\x1b[32m[LEADERBOARD STATUS: ACTIVE]\n[LAST UPDATED: ' + new Date().toLocaleString() + ']\x1b[0m```');

        // Add top 3 players
        data.leaderboard.slice(0, 3).forEach((user, index) => {
            const medals = ['🥇', '🥈', '🥉'];
            embed.addFields({
                name: `${medals[index]} ${user.username}`,
                value: `\`\`\`${user.completedAchievements}/${user.totalAchievements} (${user.completionPercentage}%)\`\`\``
            });
        });

        await message.channel.send({ embeds: [embed] });
        
        // Send follow-up message
        await message.channel.send('```ansi\n\x1b[32m> Use !profile <username> to view detailed stats...\x1b[0m█\n```');
    } catch (error) {
        console.error('Error in leaderboard command:', error);
        await message.channel.send('```ansi\n\x1b[31mERROR: Unable to fetch leaderboard data\x1b[0m\n```');
    }
}
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);

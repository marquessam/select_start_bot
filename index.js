require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { fetchLeaderboardData } = require('./raAPI.js');
const config = require('./config.js');

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
        await message.channel.send('```ansi\n\x1b[32m> Accessing challenge database...\x1b[0m\n```');

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('████ SELECT START MONTHLY CHALLENGE ████')
            .setURL(`https://retroachievements.org/game/${config.currentChallenge.gameId}`)
            .setThumbnail(`https://retroachievements.org${config.currentChallenge.gameIcon}`)
            .setDescription(`\`\`\`ansi\n\x1b[32m[CHALLENGE STATUS: ACTIVE]\n[PERIOD: ${config.currentChallenge.startDate} - ${config.currentChallenge.endDate}]\x1b[0m\`\`\``)
            .addFields(
                { 
                    name: '`MISSION`', 
                    value: `\`\`\`\nComplete achievements in ${config.currentChallenge.gameName}\`\`\`` 
                },
                { 
                    name: '`PARAMETERS`', 
                    value: `\`\`\`\n${config.currentChallenge.rules.map(rule => `- ${rule}`).join('\n')}\`\`\`` 
                },
                {
                    name: '`REWARD STRUCTURE`',
                    value: `\`\`\`\n🥇 First Place: ${config.currentChallenge.points.first} points\n🥈 Second Place: ${config.currentChallenge.points.second} points\n🥉 Third Place: ${config.currentChallenge.points.third} points\n⭐ Bonus achievements may award additional points\`\`\``
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
    // Profile command
    if (message.content.startsWith('!profile')) {
        try {
            // Get the username from the command
            const args = message.content.split(' ');
            const username = args[1];

            if (!username) {
                await message.channel.send('```ansi\n\x1b[31mERROR: Username required. Usage: !profile <username>\x1b[0m\n```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Accessing user profile data...\x1b[0m\n```');

            // Fetch the data using your existing function
            const data = await fetchLeaderboardData('3236');
            
            // Find the user in the data
            const userProgress = data.leaderboard.find(user => 
                user.username.toLowerCase() === username.toLowerCase()
            );

            if (!userProgress) {
                await message.channel.send('```ansi\n\x1b[31mERROR: User not found or no progress recorded\x1b[0m\n```');
                return;
            }

            // Create embed for user profile
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`████ AGENT PROFILE: ${userProgress.username.toUpperCase()} ████`)
                .setURL(userProgress.profileUrl)
                .setThumbnail(userProgress.profileImage)
                .setDescription('```ansi\n\x1b[32m[PROFILE STATUS: ACTIVE]\n[GAME: Final Fantasy Tactics: WotL]\x1b[0m```')
                .addFields(
                    { 
                        name: '`ACHIEVEMENTS COMPLETED`', 
                        value: `\`\`\`${userProgress.completedAchievements}/${userProgress.totalAchievements}\`\`\`` 
                    },
                    { 
                        name: '`COMPLETION RATE`', 
                        value: `\`\`\`${userProgress.completionPercentage}%\`\`\`` 
                    }
                )
                .setFooter({ text: `[DATA RETRIEVED: ${new Date().toLocaleString()}]` });

            await message.channel.send({ embeds: [embed] });
            
            // Send follow-up console prompt
            await message.channel.send('```ansi\n\x1b[32m> Use !leaderboard to view full rankings...\x1b[0m█\n```');

        } catch (error) {
            console.error('Error in profile command:', error);
            await message.channel.send('```ansi\n\x1b[31mERROR: Unable to fetch profile data\x1b[0m\n```');
        }
    }
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);

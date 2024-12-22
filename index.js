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

// Helper function for loading animation
async function showLoadingAnimation(channel, operation = 'Loading') {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    const message = await channel.send('```ansi\n\x1b[32m> ' + operation + '...\x1b[0m\n```');
    
    for (const frame of frames) {
        await message.edit('```ansi\n\x1b[32m' + frame + ' ' + operation + '...\x1b[0m\n```');
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    await message.delete();
}

// Random tech messages
const techMessages = [
    'Establishing secure connection',
    'Verifying credentials',
    'Accessing achievement database',
    'Decrypting user data',
    'Synchronizing achievement cache',
    'Validating data integrity',
    'Initializing terminal session'
];

const getRandomTechMessage = () => techMessages[Math.floor(Math.random() * techMessages.length)];

// When the bot is ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Message handler
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Help command
    if (message.content === '!help') {
        try {
            await showLoadingAnimation(message.channel, 'Accessing help documentation');
            await message.channel.send('```ansi\n\x1b[32m=== SELECT START TERMINAL V1.0 ===\n\nAVAILABLE COMMANDS:\n\n!challenge   : View current mission parameters\n!leaderboard : Display achievement rankings\n!profile     : Access user achievement data\n!help        : Display this information\n\n[Type command to execute]█\x1b[0m\n```');
        } catch (error) {
            console.error('Error in help command:', error);
        }
    }

    // Challenge command
    if (message.content === '!challenge') {
        try {
            await showLoadingAnimation(message.channel, getRandomTechMessage());

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('██████ SELECT START MONTHLY CHALLENGE ██████')
                .setURL(`https://retroachievements.org/game/${config.currentChallenge.gameId}`)
                .setThumbnail(`https://retroachievements.org${config.currentChallenge.gameIcon}`)
                .setDescription('```ansi\n\x1b[32m[CHALLENGE STATUS: ACTIVE]\n[PERIOD: ' + 
                    config.currentChallenge.startDate + ' - ' + config.currentChallenge.endDate + ']\x1b[0m```')
                .addFields(
                    { 
                        name: '`MISSION`', 
                        value: `\`\`\`ansi\n\x1b[32m${config.currentChallenge.gameName}\x1b[0m\`\`\`` 
                    },
                    { 
                        name: '`PARAMETERS`', 
                        value: `\`\`\`ansi\n\x1b[32m${config.currentChallenge.rules.map(rule => `> ${rule}`).join('\n')}\x1b[0m\`\`\`` 
                    },
                    {
                        name: '`REWARD STRUCTURE`',
                        value: `\`\`\`ansi\n\x1b[32m> 🥇 First Place: ${config.currentChallenge.points.first} points\n> 🥈 Second Place: ${config.currentChallenge.points.second} points\n> 🥉 Third Place: ${config.currentChallenge.points.third} points\n> ⭐ Bonus points available for special achievements\x1b[0m\`\`\``
                    }
                )
                .setFooter({ text: `[TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}]` });
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !leaderboard to view current rankings...\x1b[0m█\n```');
        } catch (error) {
            console.error('Error in challenge command:', error);
            await message.channel.send('```ansi\n\x1b[32m[FATAL ERROR] \x1b[37mCommand execution failed\x1b[0m\n```');
        }
    }

    // Leaderboard command
    if (message.content === '!leaderboard') {
        try {
            await showLoadingAnimation(message.channel, getRandomTechMessage());
            
            const data = await fetchLeaderboardData();
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('██████ CURRENT RANKINGS ██████')
                .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
                .setDescription('```ansi\n\x1b[32m[LEADERBOARD STATUS: ACTIVE]\n[LAST UPDATED: ' + 
                    new Date().toLocaleString() + ']\x1b[0m```');

            data.leaderboard.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                embed.addFields({
                    name: `${medals[index]} ${user.username}`,
                    value: `\`\`\`ansi\n\x1b[32m${user.completedAchievements}/${user.totalAchievements} (${user.completionPercentage}%)\x1b[0m\`\`\``
                });
            });

            if (data.additionalParticipants.length > 0) {
                embed.addFields({
                    name: '`ADDITIONAL PARTICIPANTS`',
                    value: `\`\`\`ansi\n\x1b[32m${data.additionalParticipants.join(', ')}\x1b[0m\`\`\``
                });
            }

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <username> to view detailed stats...\x1b[0m█\n```');
        } catch (error) {
            console.error('Error in leaderboard command:', error);
            await message.channel.send('```ansi\n\x1b[32m[FATAL ERROR] \x1b[37mUnable to access leaderboard data\x1b[0m\n```');
        }
    }

    // Profile command
    if (message.content.startsWith('!profile')) {
        try {
            const args = message.content.split(' ');
            const username = args[1];

            if (!username) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] \x1b[37mUsername required. Usage: !profile <username>\x1b[0m\n```');
                return;
            }

            await showLoadingAnimation(message.channel, getRandomTechMessage());
            
            const data = await fetchLeaderboardData();
            const userProgress = data.leaderboard.find(user => 
                user.username.toLowerCase() === username.toLowerCase()
            );

            if (!userProgress) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] \x1b[37mUser not found in database\x1b[0m\n```');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`██████ PROFILE: ${userProgress.username.toUpperCase()} ██████`)
                .setURL(userProgress.profileUrl)
                .setThumbnail(userProgress.profileImage)
                .setDescription('```ansi\n\x1b[32m[STATUS: AUTHENTICATED]\n[CLEARANCE: ACTIVE USER]\n[ACCESSING ACHIEVEMENT DATA...]\x1b[0m```')
                .addFields(
                    { 
                        name: '`CURRENT MISSION STATUS`', 
                        value: `\`\`\`ansi\n\x1b[32m${config.currentChallenge.gameName}\x1b[0m\`\`\`` 
                    },
                    { 
                        name: '`ACHIEVEMENT ANALYSIS`', 
                        value: `\`\`\`ansi\n\x1b[32mCOMPLETED: ${userProgress.completedAchievements}/${userProgress.totalAchievements}\nPROGRESS: ${userProgress.completionPercentage}%\x1b[0m\`\`\`` 
                    }
                )
                .setFooter({ text: `[TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}]` });

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Connection terminated\n> Type !help for available commands...\x1b[0m█\n```');

        } catch (error) {
            console.error('Error in profile command:', error);
            await message.channel.send('```ansi\n\x1b[32m[FATAL ERROR] \x1b[37mDatabase connection failed\x1b[0m\n```');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

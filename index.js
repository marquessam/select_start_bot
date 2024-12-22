require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { fetchLeaderboardData, fetchNominations } = require('./raAPI.js');
const config = require('./config.js');


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
// Nominations command
    if (message.content === '!nominations') {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing nominations database...\x1b[0m\n```');
            
            const nominations = await fetchNominations();
            console.log('Nominations data:', nominations); // Debug log
            
            // Check if we got data
            if (!nominations || Object.keys(nominations).length === 0) {
                throw new Error('No nominations data received');
            }
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('NOMINATED GAMES')
                .setDescription('```ansi\n\x1b[32m[DATABASE ACCESSED]\n[NOMINATIONS SORTED BY PLATFORM]\x1b[0m```');

            // Add each platform as a field
            for (const [platform, games] of Object.entries(nominations).sort()) {
                if (games.length > 0) {
                    console.log(`Adding platform ${platform} with ${games.length} games`); // Debug log
                    embed.addFields({
                        name: `${platform}`,
                        value: '```ansi\n\x1b[32m' + games.map(game => `> ${game}`).join('\n') + '\x1b[0m```'
                    });
                }
            }

            embed.setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !challenge to view current challenge\x1b[0m█\n```');
        } catch (error) {
            console.error('Error in nominations command:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Unable to access nominations database\nDetails: ' + error.message + '\x1b[0m\n```');
        }
    }
   // Help command
    if (message.content === '!help') {
        await message.channel.send('```ansi\n\x1b[32m> Accessing terminal...\x1b[0m\n```');
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('SELECT START TERMINAL')
            .setDescription('```ansi\n\x1b[32mAVAILABLE COMMANDS:\n\n!challenge\nDisplaycurrent challenge\n\n!leaderboard\nDisplay achievement rankings\n\n!profile <user>\nDisplay user achievement data\n\n!nominations\nDisplay nominated games\n\n[Ready for input]█\x1b[0m```')
            .setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });
            
        await message.channel.send({ embeds: [embed] });
    }

    // Challenge command
    if (message.content === '!challenge') {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing challenge data...\x1b[0m\n```');

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('MONTHLY CHALLENGE')
                .setURL(`https://retroachievements.org/game/${config.currentChallenge.gameId}`)
                .setThumbnail(`https://retroachievements.org${config.currentChallenge.gameIcon}`)
                .setDescription('```ansi\n\x1b[32m[STATUS: ACTIVE]\n[DATA VERIFIED]\x1b[0m```')
                .addFields(
                    { name: 'CHALLENGE', value: '```ansi\n\x1b[32m' + config.currentChallenge.gameName + '\x1b[0m```' },
                    { name: 'TIMEFRAME', value: '```ansi\n\x1b[32m' + config.currentChallenge.startDate + ' - ' + config.currentChallenge.endDate + '\x1b[0m```' },
                    { name: 'PARAMETERS', value: '```ansi\n\x1b[32m' + config.currentChallenge.rules.map(rule => `> ${rule}`).join('\n') + '\x1b[0m```' },
                    { name: 'REWARD STRUCTURE', value: '```ansi\n\x1b[32m> 🥇 ' + config.currentChallenge.points.first + ' pts\n> 🥈 ' + config.currentChallenge.points.second + ' pts\n> 🥉 ' + config.currentChallenge.points.third + ' pts\x1b[0m```' }
                )
                .setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !leaderboard to view rankings\x1b[0m█\n```');
        } catch (error) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Challenge data inaccessible\x1b[0m\n```');
        }
    }

    // Leaderboard command
    if (message.content === '!leaderboard') {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing achievement database...\x1b[0m\n```');
            
            const data = await fetchLeaderboardData();
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('ACHIEVEMENT RANKINGS')
                .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
                .setDescription('```ansi\n\x1b[32m[DATA SYNCHRONIZED]\x1b[0m```');

            data.leaderboard.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                embed.addFields({
                    name: `${medals[index]} ${user.username}`,
                    value: '```ansi\n\x1b[32m' + user.completedAchievements + '/' + user.totalAchievements + ' (' + user.completionPercentage + '%)\x1b[0m```'
                });
            });

            if (data.additionalParticipants.length > 0) {
                embed.addFields({
                    name: 'ADDITIONAL OPERATIVES',
                    value: '```ansi\n\x1b[32m' + data.additionalParticipants.join(', ') + '\x1b[0m```'
                });
            }

            embed.setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\x1b[0m█\n```');
        } catch (error) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Database sync failed\x1b[0m\n```');
        }
    }

    // Profile command
    if (message.content.startsWith('!profile')) {
        try {
            const username = message.content.split(' ')[1];

            if (!username) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Syntax: !profile <username>\x1b[0m\n```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            const data = await fetchLeaderboardData();
            const userProgress = data.leaderboard.find(user => 
                user.username.toLowerCase() === username.toLowerCase()
            );

            if (!userProgress) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] User not found in database\x1b[0m\n```');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`USER: ${userProgress.username}`)
                .setURL(userProgress.profileUrl)
                .setThumbnail(userProgress.profileImage)
                .setDescription('```ansi\n\x1b[32m[STATUS: AUTHENTICATED]\n[ACCESS GRANTED]\x1b[0m```')
                .addFields(
                    { 
                        name: 'ACHIEVEMENT STATUS',
                        value: '```ansi\n\x1b[32mCompleted: ' + userProgress.completedAchievements + '/' + userProgress.totalAchievements + '\nProgress: ' + userProgress.completionPercentage + '%\x1b[0m```'
                    }
                )
                .setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Connection secure\x1b[0m█\n```');
        } catch (error) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Database connection failed\x1b[0m\n```');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

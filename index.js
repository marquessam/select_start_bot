require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { fetchLeaderboardData, fetchNominations } = require('./raAPI.js');
const { getCurrentChallenge } = require('./challengeConfig.js');
const ShadowGame = require('./shadowGame.js');
const shadowGame = new ShadowGame();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await shadowGame.loadConfig();
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Check for shadow game solutions
    await shadowGame.checkMessage(message);

    // Help command
    if (message.content === '!help') {
        await message.channel.send('```ansi\n\x1b[32m> Accessing terminal...\x1b[0m\n```');
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('SELECT START TERMINAL')
            .setDescription('```ansi\n\x1b[32mAVAILABLE COMMANDS:\n\n!challenge\nDisplay current challenge\n\n!leaderboard\nDisplay achievement rankings\n\n!profile <user>\nAccess user achievement data\n\n!nominations\nDisplay nominated games\n\n[Ready for input]█\x1b[0m```')
            .setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });
            
        await message.channel.send({ embeds: [embed] });
        await shadowGame.tryShowError(message);
    }

    // Challenge command
    if (message.content === '!challenge') {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing challenge database...\x1b[0m\n```');

            const currentChallenge = await getCurrentChallenge();

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('MONTHLY CHALLENGE')
                .setURL(`https://retroachievements.org/game/${currentChallenge.gameId}`)
                .setThumbnail(`https://retroachievements.org${currentChallenge.gameIcon}`)
                .setDescription('```ansi\n\x1b[32m[STATUS: ACTIVE]\n[DATA VERIFIED]\x1b[0m```')
                .addFields(
                    { 
                        name: 'CURRENT CHALLENGE',
                        value: '```ansi\n\x1b[32m' + currentChallenge.gameName + '\x1b[0m```'
                    },
                    {
                        name: 'CHALLENGE TIMEFRAME',
                        value: '```ansi\n\x1b[32m' + currentChallenge.startDate + ' - ' + currentChallenge.endDate + '\x1b[0m```'
                    },
                    {
                        name: 'CHALLENGE PARAMETERS',
                        value: '```ansi\n\x1b[32m' + currentChallenge.rules.map(rule => `> ${rule}`).join('\n') + '\x1b[0m```'
                    },
                    {
                        name: 'REWARD PROTOCOL',
                        value: '```ansi\n\x1b[32m> 🥇 ' + currentChallenge.points.first + ' pts\n> 🥈 ' + currentChallenge.points.second + ' pts\n> 🥉 ' + currentChallenge.points.third + ' pts\x1b[0m```'
                    }
                )
                .setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !leaderboard to view current rankings\n[Ready for input]█\x1b[0m```');
            await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Challenge Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Mission data inaccessible\n[Ready for input]█\x1b[0m```');
        }
    }

    // Leaderboard command
    if (message.content === '!leaderboard') {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing achievement database...\x1b[0m\n```');
            
            const data = await fetchLeaderboardData();
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('USER RANKINGS')
                .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`)
                .setDescription('```ansi\n\x1b[32m[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT RANKINGS]\x1b[0m```');

            // Display top 3 with medals and detailed stats
            data.leaderboard.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                embed.addFields({
                    name: `${medals[index]} ${user.username}`,
                    value: '```ansi\n\x1b[32mACHIEVEMENTS: ' + user.completedAchievements + '/' + user.totalAchievements + '\nPROGRESS: ' + user.completionPercentage + '%\x1b[0m```'
                });
            });

            // Get additional participants (4th place and beyond)
            const additionalOperatives = data.leaderboard.slice(3);
            if (additionalOperatives.length > 0) {
                // Create multiple smaller fields if needed
                const chunkSize = 10; // Smaller chunk size to handle Discord's limits
                let allUsers = additionalOperatives.map(user => user.username);
                
                // Split the users into chunks and create separate fields
                while (allUsers.length > 0) {
                    const chunk = allUsers.splice(0, chunkSize);
                    embed.addFields({
                        name: 'ADDITIONAL PARTICIPANTS',
                        value: '```ansi\n\x1b[32m' + chunk.join(', ') + '...\x1b[0m```'
                    });
                }
            }

            embed.setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\n[Ready for input]█\x1b[0m```');
            await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Leaderboard Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Database sync failed\n[Ready for input]█\x1b[0m```');
        }
    }
    
    // Profile command
    if (message.content.startsWith('!profile')) {
        try {
            const username = message.content.split(' ')[1];

            if (!username) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Accessing operative records...\x1b[0m\n```');

            const data = await fetchLeaderboardData();
            const userProgress = data.leaderboard.find(user => 
                user.username.toLowerCase() === username.toLowerCase()
            );

            if (!userProgress) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] User not found in database\n[Ready for input]█\x1b[0m```');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`OPERATIVE DATA: ${userProgress.username}`)
                .setURL(userProgress.profileUrl)
                .setThumbnail(userProgress.profileImage)
                .setDescription('```ansi\n\x1b[32m[STATUS: AUTHENTICATED]\n[CLEARANCE: GRANTED]\x1b[0m```')
                .addFields(
                    { 
                        name: 'MISSION PROGRESS',
                        value: '```ansi\n\x1b[32mACHIEVEMENTS: ' + userProgress.completedAchievements + '/' + userProgress.totalAchievements + '\nCOMPLETION: ' + userProgress.completionPercentage + '%\x1b[0m```'
                    }
                )
                .setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');
            await shadowGame.tryShowError(message);
        } catch (error) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Database connection failed\n[Ready for input]█\x1b[0m```');
        }
    }

    // Nominations command
    if (message.content === '!nominations') {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing nominations database...\x1b[0m\n```');
            
            const nominations = await fetchNominations();
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('NOMINATED TITLES')
                .setDescription('```ansi\n\x1b[32m[DATABASE ACCESS GRANTED]\n[DISPLAYING NOMINATIONS BY PLATFORM]\x1b[0m```');

            for (const [platform, games] of Object.entries(nominations).sort()) {
                if (games.length > 0) {
                    embed.addFields({
                        name: `PLATFORM: ${platform.toUpperCase()}`,
                        value: '```ansi\n\x1b[32m' + games.map(game => `> ${game}`).join('\n') + '\x1b[0m```'
                    });
                }
            }

            embed.setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !challenge to view current challenge\n[Ready for input]█\x1b[0m```');
            await shadowGame.tryShowError(message);
        } catch (error) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Unable to access nominations\n[Ready for input]█\x1b[0m```');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

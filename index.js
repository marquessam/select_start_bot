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

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Help command
    if (message.content === '!help') {
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Commands')
            .addFields(
                { name: '!challenge', value: 'View current challenge' },
                { name: '!leaderboard', value: 'View rankings' },
                { name: '!profile <name>', value: 'View player stats' }
            );
        await message.channel.send({ embeds: [embed] });
    }

    // Challenge command
    if (message.content === '!challenge') {
        try {
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Monthly Challenge')
                .setURL(`https://retroachievements.org/game/${config.currentChallenge.gameId}`)
                .setThumbnail(`https://retroachievements.org${config.currentChallenge.gameIcon}`)
                .addFields(
                    { name: 'Game', value: config.currentChallenge.gameName },
                    { name: 'Period', value: `${config.currentChallenge.startDate} - ${config.currentChallenge.endDate}` },
                    { name: 'Rules', value: config.currentChallenge.rules.map(rule => `• ${rule}`).join('\n') },
                    { name: 'Points', value: `🥇 ${config.currentChallenge.points.first}\n🥈 ${config.currentChallenge.points.second}\n🥉 ${config.currentChallenge.points.third}` }
                );
            
            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            await message.channel.send('Error loading challenge data');
        }
    }

    // Leaderboard command
    if (message.content === '!leaderboard') {
        try {
            const data = await fetchLeaderboardData();
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Rankings')
                .setThumbnail(`https://retroachievements.org${data.gameInfo.ImageIcon}`);

            // Add top 3 with medals
            data.leaderboard.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                embed.addFields({
                    name: `${medals[index]} ${user.username}`,
                    value: `${user.completedAchievements}/${user.totalAchievements} (${user.completionPercentage}%)`
                });
            });

            // Add other participants if any
            if (data.additionalParticipants.length > 0) {
                embed.addFields({
                    name: 'Also Participating',
                    value: data.additionalParticipants.join(', ')
                });
            }

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            await message.channel.send('Error loading leaderboard');
        }
    }

    // Profile command
    if (message.content.startsWith('!profile')) {
        try {
            const username = message.content.split(' ')[1];

            if (!username) {
                await message.channel.send('Usage: !profile <username>');
                return;
            }

            const data = await fetchLeaderboardData();
            const userProgress = data.leaderboard.find(user => 
                user.username.toLowerCase() === username.toLowerCase()
            );

            if (!userProgress) {
                await message.channel.send('User not found');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(userProgress.username)
                .setURL(userProgress.profileUrl)
                .setThumbnail(userProgress.profileImage)
                .addFields(
                    { 
                        name: 'Progress', 
                        value: `${userProgress.completedAchievements}/${userProgress.totalAchievements} (${userProgress.completionPercentage}%)`
                    }
                );

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            await message.channel.send('Error loading profile');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { fetchLeaderboardData, fetchNominations } = require('./raAPI.js');
const { getCurrentChallenge } = require('./challengeConfig.js');
const ShadowGame = require('./shadowGame.js');
const UserStats = require('./userStats.js');

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

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        shadowGame = new ShadowGame();
        await shadowGame.loadConfig();
        await userStats.loadStats();
        console.log('ShadowGame and UserStats initialized successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
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
            .setDescription('```ansi\n\x1b[32mAVAILABLE COMMANDS:\n\n' +
                '=== CHALLENGE INFO ===\n' +
                '!challenge\nDisplay current challenge\n\n' +
                '!leaderboard\nDisplay achievement rankings\n\n' +
                '!nominations\nDisplay nominated games\n\n' +
                '=== USER STATS ===\n' +
                '!profile <user>\nAccess user achievement data\n\n' +
                '!yearlyboard\nDisplay yearly rankings\n\n' +
                '!viewarchive <month>\nView historical rankings\n\n' +
                '=== ADMIN COMMANDS ===\n' +
                '!addpoints <user> <points> <reason>\nAdd bonus points to user\n\n' +
                '!updatemonth <month> <first> <second> <third>\nUpdate monthly rankings\n\n' +
                '!archivemonth\nArchive current rankings\n\n' +
                '[Ready for input]█\x1b[0m```')
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

            // Display top 3 with medals
            data.leaderboard.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                embed.addFields({
                    name: `${medals[index]} ${user.username}`,
                    value: '```ansi\n\x1b[32mACHIEVEMENTS: ' + user.completedAchievements + '/' + user.totalAchievements + '\nPROGRESS: ' + user.completionPercentage + '%\x1b[0m```'
                });
            });

            // Additional participants
            const additionalUsers = data.leaderboard.slice(3);
            if (additionalUsers.length > 0) {
                embed.addFields({
                    name: 'ADDITIONAL PARTICIPANTS',
                    value: '```ansi\n\x1b[32m' + additionalUsers.map(user => user.username).join(', ') + '\x1b[0m```'
                });
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

            const stats = await userStats.getUserStats(username);
            
            if (!userProgress) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] User not found in database\n[Ready for input]█\x1b[0m```');
                return;
            }

            const currentYear = new Date().getFullYear().toString();
            const yearlyPoints = stats.yearlyPoints[currentYear] || 0;

            const recentAchievements = stats.monthlyAchievements[currentYear] || {};
            const recentAchievementsText = Object.entries(recentAchievements)
                .map(([month, achievement]) => 
                    `${month}: ${achievement.place} place (${achievement.points} pts)`)
                .join('\n');

            const recentBonusPoints = stats.bonusPoints
                .filter(bonus => bonus.year === currentYear)
                .map(bonus => `${bonus.points} pts - ${bonus.reason}`)
                .join('\n');

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`OPERATIVE DATA: ${userProgress.username}`)
                .setURL(userProgress.profileUrl)
                .setThumbnail(userProgress.profileImage)
                .setDescription('```ansi\n\x1b[32m[STATUS: AUTHENTICATED]\n[CLEARANCE: GRANTED]\x1b[0m```')
                .addFields(
                    { 
                        name: 'CURRENT MISSION PROGRESS',
                        value: '```ansi\n\x1b[32mACHIEVEMENTS: ' + userProgress.completedAchievements + '/' + userProgress.totalAchievements + '\nCOMPLETION: ' + userProgress.completionPercentage + '%\x1b[0m```'
                    },
                    {
                        name: 'YEARLY STATISTICS',
                        value: '```ansi\n\x1b[32mTOTAL POINTS: ' + yearlyPoints + '\nRANK: Coming soon...\x1b[0m```'
                    }
                );

            if (recentAchievementsText) {
                embed.addFields({
                    name: 'MONTHLY ACHIEVEMENTS',
                    value: '```ansi\n\x1b[32m' + recentAchievementsText + '\x1b[0m```'
                });
            }

            if (recentBonusPoints) {
                embed.addFields({
                    name: 'BONUS POINTS',
                    value: '```ansi\n\x1b[32m' + recentBonusPoints + '\x1b[0m```'
                });
            }

            embed.setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });

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

    // Yearly leaderboard command
    if (message.content === '!yearlyboard') {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing yearly rankings...\x1b[0m\n```');
            
            const leaderboard = await userStats.getYearlyLeaderboard();
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('YEARLY RANKINGS')
                .setDescription('```ansi\n\x1b[32m[DATABASE ACCESS GRANTED]\n[DISPLAYING CURRENT STANDINGS]\x1b[0m```');

            const top10 = leaderboard.slice(0, 10);
            const leaderboardText = top10
                .map((user, index) => `${index + 1}. ${user.username}: ${user.points} points`)
                .join('\n');

            embed.addFields({
                name: 'TOP OPERATORS',
                value: '```ansi\n\x1b[32m' + leaderboardText + '\x1b[0m```'
            });

            embed.setFooter({ text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` });
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <user> for detailed stats\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve yearly rankings\n[Ready for input]█\x1b[0m```');
        }
    }
// Add points command (admin only)
    if (message.content.startsWith('!addpoints')) {
        try {
            // Check for admin role
            if (!message.member.roles.cache.some(role => role.name === 'Admin')) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient clearance level\n[Ready for input]█\x1b[0m```');
                return;
            }

            const args = message.content.split(' ');
            if (args.length < 4) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !addpoints <username> <points> <reason>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const username = args[1];
            const points = parseInt(args[2]);
            const reason = args.slice(3).join(' ');

            if (isNaN(points)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid points value\n[Ready for input]█\x1b[0m```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Processing points allocation...\x1b[0m\n```');

            // Add points to user's stats
            await userStats.addBonusPoints(username, points, reason);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('POINTS ALLOCATED')
                .setDescription('```ansi\n\x1b[32m[TRANSACTION COMPLETE]\n[POINTS ADDED SUCCESSFULLY]\x1b[0m```')
                .addFields(
                    {
                        name: 'OPERATION DETAILS',
                        value: '```ansi\n\x1b[32mUSER: ' + username + '\nPOINTS: ' + points + '\nREASON: ' + reason + '\x1b[0m```'
                    }
                )
                .setFooter({ text: `TRANSACTION_ID: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile ' + username + ' to verify points\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Add Points Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to allocate points\n[Ready for input]█\x1b[0m```');
        }
    }

    // Add monthly ranking update command (admin only)
    if (message.content.startsWith('!updatemonth')) {
        try {
            // Check for admin role
            if (!message.member.roles.cache.some(role => role.name === 'Admin')) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient clearance level\n[Ready for input]█\x1b[0m```');
                return;
            }

            const args = message.content.split(' ');
            if (args.length !== 5) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !updatemonth <month> <first> <second> <third>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const [_, month, first, second, third] = args;
            const year = new Date().getFullYear().toString();

            await message.channel.send('```ansi\n\x1b[32m> Processing monthly rankings update...\x1b[0m\n```');

            // Update monthly rankings
            await userStats.addMonthlyPoints(month, year, {
                first,
                second,
                third
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('MONTHLY RANKINGS UPDATED')
                .setDescription('```ansi\n\x1b[32m[UPDATE COMPLETE]\n[POINTS ALLOCATED]\x1b[0m```')
                .addFields(
                    {
                        name: 'RANKINGS PROCESSED',
                        value: '```ansi\n\x1b[32mMONTH: ' + month + 
                              '\n1ST PLACE: ' + first + ' (3 pts)' +
                              '\n2ND PLACE: ' + second + ' (2 pts)' +
                              '\n3RD PLACE: ' + third + ' (1 pt)\x1b[0m```'
                    }
                )
                .setFooter({ text: `UPDATE_ID: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !yearlyboard to verify rankings\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Update Month Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to update monthly rankings\n[Ready for input]█\x1b[0m```');
        }
    }

// Archive current leaderboard (admin only)
    if (message.content === '!archivemonth') {
        try {
            // Check for admin role
            if (!message.member.roles.cache.some(role => role.name === 'Admin')) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient clearance level\n[Ready for input]█\x1b[0m```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Archiving current leaderboard...\x1b[0m\n```');
            
            const data = await fetchLeaderboardData();
            const archiveResult = await userStats.archiveLeaderboard(data);
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('LEADERBOARD ARCHIVED')
                .setDescription('```ansi\n\x1b[32m[ARCHIVE COMPLETE]\n[DATA STORED SUCCESSFULLY]\x1b[0m```')
                .addFields(
                    {
                        name: 'ARCHIVE DETAILS',
                        value: '```ansi\n\x1b[32mMONTH: ' + archiveResult.month +
                              '\nYEAR: ' + archiveResult.year +
                              '\nENTRIES: ' + archiveResult.rankings.length + '\x1b[0m```'
                    }
                )
                .setFooter({ text: `ARCHIVE_ID: ${Date.now().toString(36).toUpperCase()}` });

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !viewarchive <month> to view archived data\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Archive Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to archive leaderboard\n[Ready for input]█\x1b[0m```');
        }
    }

    // View archived leaderboard
    if (message.content.startsWith('!viewarchive')) {
        try {
            const args = message.content.split(' ');
            if (args.length < 2) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !viewarchive <month>\n[Ready for input]█\x1b[0m```');
                return;
            }

            const month = args[1];
            await message.channel.send('```ansi\n\x1b[32m> Accessing archived data...\x1b[0m\n```');
            
            const archive = await userStats.getMonthlyArchive(month);
            
            if (!archive) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No archive found for ' + month + '\n[Ready for input]█\x1b[0m```');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`ARCHIVED RANKINGS: ${month.toUpperCase()}`)
                .setThumbnail(`https://retroachievements.org${archive.gameInfo.ImageIcon}`)
                .setDescription('```ansi\n\x1b[32m[ARCHIVE ACCESS GRANTED]\n[DISPLAYING HISTORICAL DATA]\x1b[0m```');

            // Display top 3 with medals
            archive.rankings.slice(0, 3).forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                embed.addFields({
                    name: `${medals[index]} ${user.username}`,
                    value: '```ansi\n\x1b[32mACHIEVEMENTS: ' + user.completedAchievements + '/' + user.totalAchievements + '\nPROGRESS: ' + user.completionPercentage + '%\x1b[0m```'
                });
            });

            // Additional participants
            const additionalUsers = archive.rankings.slice(3);
            if (additionalUsers.length > 0) {
                embed.addFields({
                    name: 'ADDITIONAL PARTICIPANTS',
                    value: '```ansi\n\x1b[32m' + additionalUsers.map(user => user.username).join(', ') + '\x1b[0m```'
                });
            }

            embed.setFooter({ text: `ARCHIVE_ID: ${new Date(archive.archivedDate).toString(36).toUpperCase()}` });
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Archive data retrieved successfully\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('View Archive Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve archive\n[Ready for input]█\x1b[0m```');
        }
    }
}); // Close the messageCreate event handler

// Move client.login outside of the event handler
client.login(process.env.DISCORD_TOKEN);

const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

module.exports = {
    name: 'challenge',
    description: 'Displays current monthly challenge, shadow game challenge, or ways to earn points',

    async execute(message, args, { shadowGame }) {
        try {
            if (!args.length) {
                await this.displayChallengeOptions(message, shadowGame);
                return;
            }

            const subcommand = args[0].toLowerCase();

            switch (subcommand) {
                case 'monthly':
                    await this.displayMonthlyChallenge(message, shadowGame);
                    break;
                case 'shadow':
                    await this.displayShadowChallenge(message, shadowGame);
                    break;
                case 'points':
                    await this.displayPointsInfo(message, shadowGame);
                    break;
                default:
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid option\nUse !challenge to see available options\n[Ready for input]█\x1b[0m```');
                    if (shadowGame) await shadowGame.tryShowError(message);
            }
        } catch (error) {
            console.error('Challenge Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to process challenge command\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayChallengeOptions(message, shadowGame) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing challenge database...\x1b[0m\n```');
            const embed = new TerminalEmbed()
                .setTerminalTitle('CHALLENGE OPTIONS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[SELECT A SUBCOMMAND]\n')
                .addTerminalField('USAGE',
                    '1. `!challenge monthly` - View the current monthly challenge and points structure.\n' +
                    '2. `!challenge shadow` - View the current shadow game challenge.\n' +
                    '3. `!challenge points` - View all ways to earn points.')
                .setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type a subcommand to proceed\n[Ready for input]█\x1b[0m```');
            if (shadowGame) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Display Challenge Options Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Unable to display challenge options\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayMonthlyChallenge(message, shadowGame) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing monthly challenge...\x1b[0m\n```');
            const currentChallenge = await database.getCurrentChallenge();
            if (!currentChallenge || !currentChallenge.gameId) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No active monthly challenge found\n[Ready for input]█\x1b[0m```');
                return;
            }
            const embed = new TerminalEmbed()
                .setTerminalTitle('MONTHLY CHALLENGE')
                .setURL(`https://retroachievements.org/game/${currentChallenge.gameId}`)
                .setThumbnail(`https://retroachievements.org${currentChallenge.gameIcon}`)
                .setTerminalDescription('[STATUS: ACTIVE]\n[DATA VERIFIED]')
                .addTerminalField('CURRENT CHALLENGE', currentChallenge.gameName)
                .addTerminalField('CHALLENGE TIMEFRAME', `${currentChallenge.startDate} - ${currentChallenge.endDate}`)
                .addTerminalField('CHALLENGE PARAMETERS', currentChallenge.rules.map(rule => `> ${rule}`).join('\n'))
                .addTerminalField('REWARD PROTOCOL',
                    `> 🥇 ${currentChallenge.points.first} pts\n> 🥈 ${currentChallenge.points.second} pts\n> 🥉 ${currentChallenge.points.third} pts`)
                .addTerminalField('POINT STRUCTURE',
                    `- **Participation:** 1 point (earning an achievement)\n` +
                    `- **Beaten:** +3 points (beating the game)\n` +
                    `- **Mastery:** +3 points (earning 100% of achievements)\n\n` +
                    `*Note: Points for participation and beating are only available during the active month.*`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !challenge to see other options\n[Ready for input]█\x1b[0m```');
            if (shadowGame) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Monthly Challenge Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve monthly challenge\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayShadowChallenge(message, shadowGame) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing shadow game challenge...\x1b[0m\n```');

            const shadowChallenge = await database.getShadowGame();
            if (!shadowChallenge || !shadowChallenge.active) {
                await message.channel.send('```ansi\n\x1b[32m[STATUS] Current shadow game hidden.\n[Ready for input]█\x1b[0m```');
                return;
            }

            const embed = new TerminalEmbed()
                .setTerminalTitle('SHADOW GAME CHALLENGE')
                .setTerminalDescription('[STATUS: UNLOCKED]\n[DATA VERIFIED]')
                .addTerminalField('CURRENT SHADOW CHALLENGE', shadowChallenge.gameName || 'Unknown Challenge')
                .addTerminalField('CHALLENGE TIMEFRAME', `${shadowChallenge.startDate || 'N/A'} - ${shadowChallenge.endDate || 'N/A'}`)
                .addTerminalField('CHALLENGE PARAMETERS', shadowChallenge.rules.map(rule => `> ${rule}`).join('\n') || 'No rules available')
                .addTerminalField('REWARD PROTOCOL',
                    shadowChallenge.points.first ?
                        `> 🥇 ${shadowChallenge.points.first} pts\n> 🥈 ${shadowChallenge.points.second || 0} pts\n> 🥉 ${shadowChallenge.points.third || 0} pts` :
                        'No reward information')
                .addTerminalField('POINT STRUCTURE',
                    `- **Participation:** 1 point (earning an achievement)\n` +
                    `- **Beaten:** +3 points (beating the game)\n\n` +
                    `*Note: Points for participation and beating are only available during the active month.*`)
                .setTerminalFooter();

            if (shadowChallenge.gameId) embed.setURL(`https://retroachievements.org/game/${shadowChallenge.gameId}`);
            if (shadowChallenge.gameIcon) embed.setThumbnail(`https://retroachievements.org${shadowChallenge.gameIcon}`);

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !challenge to see other options\n[Ready for input]█\x1b[0m```');
            if (shadowGame) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Shadow Game Challenge Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve shadow game challenge\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayPointsInfo(message, shadowGame) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing points information...\x1b[0m\n```');

            const embed = new TerminalEmbed()
                .setTerminalTitle('HOW TO EARN POINTS')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING POINT EARNINGS]')
                .addTerminalField('CHALLENGE POINTS',
                    `**Participation:**\nA point is awarded for participating in the monthly challenge or shadow games (earning an achievement).\n` +
                    `**Beaten:**\n3 points are awarded for beating the game in either the monthly challenge or shadow games.\n` +
                    `**Mastery:**\n3 points are awarded for earning 100% of achievements in the monthly challenge. This can be done any time during the year.\n`)
                .addTerminalField('OTHER POINT EARNINGS',
                    `**Profile Linking:**\n1 point is awarded for linking your Discord and RetroAchievements profiles.\n\n` +
                    `**Beta Membership:**\n1 point is awarded for being a Beta member.\n`)
                .addTerminalField('NOTES',
                    `- Points for participation and beating challenges are only available during the active month.\n` +
                    `- Mastery is not available for Shadow Games.`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !challenge to see other options\n[Ready for input]█\x1b[0m```');
            if (shadowGame) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Points Information Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve points information\n[Ready for input]█\x1b[0m```');
        }
    }
};

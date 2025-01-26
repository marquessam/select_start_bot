const TerminalEmbed = require('../utils/embedBuilder');
const database = require('../database');

module.exports = {
    name: 'rules',
    description: 'Displays community rules and challenge information',

    async execute(message, args, { shadowGame }) {
        try {
            if (!args.length) {
                return await this.displayRuleCategories(message);
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
                case 'community':
                    await this.displayCommunityRules(message);
                    break;
                default:
                    await this.displayRuleCategories(message);
            }
        } catch (error) {
            console.error('Rules Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to display rules\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayRuleCategories(message) {
        const embed = new TerminalEmbed()
            .setTerminalTitle('SELECT START RULES')
            .setTerminalDescription('[RULES DATABASE]\n[SELECT A CATEGORY]')
            .addTerminalField('AVAILABLE CATEGORIES',
                '1. !rules monthly - Monthly Challenge Rules & Information\n' +
                '2. !rules shadow - Shadow Game Challenge Information\n' +
                '3. !rules points - Point System Rules & Information\n' +
                '4. !rules community - Community Guidelines & Discord Rules'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
    },

    async displayMonthlyChallenge(message, shadowGame) {
        try {
            const currentChallenge = await database.getCurrentChallenge();
            
            if (!currentChallenge || !currentChallenge.gameId) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No active monthly challenge found\n[Ready for input]█\x1b[0m```');
                return;
            }

            const embed = new TerminalEmbed()
                .setTerminalTitle('MONTHLY CHALLENGE RULES')
                .setURL(`https://retroachievements.org/game/${currentChallenge.gameId}`)
                .setThumbnail(`https://retroachievements.org${currentChallenge.gameIcon}`)
                .setTerminalDescription('[CURRENT CHALLENGE INFORMATION]')
                .addTerminalField('ACTIVE CHALLENGE', 
                    `GAME: ${currentChallenge.gameName}\n` +
                    `DATES: ${currentChallenge.startDate} - ${currentChallenge.endDate}`
                )
                .addTerminalField('CHALLENGE RULES', 
                    currentChallenge.rules.map(rule => `> ${rule}`).join('\n')
                )
                .addTerminalField('PLACEMENT REWARDS',
                    `> 🥇 ${currentChallenge.points.first} pts\n` +
                    `> 🥈 ${currentChallenge.points.second} pts\n` +
                    `> 🥉 ${currentChallenge.points.third} pts`
                )
                .addTerminalField('ACHIEVEMENT POINTS',
                    `- Participation: 1 point (earning any achievement)\n` +
                    `- Game Beaten: +3 points (completing the game)\n` +
                    `- Mastery: +3 points (100% completion)\n\n` +
                    `*Note: Participation and beaten points must be earned during the active month.*`
                )
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            if (shadowGame) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Monthly Rules Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve monthly challenge rules\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayShadowChallenge(message, shadowGame) {
        try {
            const shadowConfig = await database.getShadowGame();
            if (!shadowConfig || !shadowConfig.active) {
                await message.channel.send('```ansi\n\x1b[32m[STATUS] Shadow game information unavailable.\n[Ready for input]█\x1b[0m```');
                return;
            }

            const isDiscovered = shadowConfig.currentProgress >= shadowConfig.puzzles.length;
            const embed = new TerminalEmbed()
                .setTerminalTitle('SHADOW GAME RULES')
                .setTerminalDescription(
                    '[SHADOW GAME INFORMATION]\n\n' +
                    'The shadow game is a special monthly bonus challenge hidden within our community. ' +
                    'Once discovered through solving puzzles, it becomes available to all members as an ' +
                    'additional way to earn points alongside the main monthly challenge.'
                )
                .addTerminalField('HOW IT WORKS',
                    '1. A series of puzzles are hidden in the community\n' +
                    '2. Members work together to solve these puzzles\n' +
                    '3. Upon completion, a bonus game challenge is revealed\n' +
                    '4. All members can then participate for additional points'
                );

            if (isDiscovered) {
                embed
                    .addTerminalField('CURRENT CHALLENGE',
                        `GAME: ${shadowConfig.finalReward.gameName}\n` +
                        'PLATFORM: Nintendo 64'
                    )
                    .addTerminalField('POINT STRUCTURE',
                        `- Participation: ${shadowConfig.points.participation} point\n` +
                        `- Game Beaten: ${shadowConfig.points.beaten} points\n\n` +
                        '*Points can be earned alongside monthly challenge.*'
                    )
                    .setURL(`https://retroachievements.org/game/${shadowConfig.finalReward.gameId}`);
            } else {
                embed.addTerminalField('STATUS', 'Current shadow game has not yet been discovered.');
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            if (shadowGame) await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Shadow Rules Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve shadow game rules\n[Ready for input]█\x1b[0m```');
        }
    },

    async displayPointsInfo(message, shadowGame) {
        const embed = new TerminalEmbed()
            .setTerminalTitle('POINT SYSTEM RULES')
            .setTerminalDescription('[POINT SYSTEM INFORMATION]')
            .addTerminalField('MONTHLY CHALLENGE POINTS',
                '**Monthly Game Points:**\n' +
                '- Participation (1 point): Earn any achievement\n' +
                '- Game Beaten (3 points): Complete the game\n' +
                '- Mastery (3 points): 100% achievement completion\n' +
                '- Top 3 Placement: 6/4/2 points (1st/2nd/3rd)\n\n' +
                '**Shadow Game Points:**\n' +
                '- Participation (1 point): Earn any achievement\n' +
                '- Game Beaten (3 points): Complete the game'
            )
            .addTerminalField('COMMUNITY POINTS',
                '**Profile Setup:**\n' +
                '- Link RetroAchievements profile (1 point)\n' +
                '- Verify Discord membership (1 point)\n\n' +
                '**Special Events:**\n' +
                '- Beta testing participation (1 point)\n' +
                '- Community event participation (varies)\n' +
                '- Arcade challenge high scores (varies)'
            )
            .addTerminalField('IMPORTANT NOTES',
                '- Participation and beaten points are time-limited\n' +
                '- Mastery points can be earned anytime during the year\n' +
                '- Points contribute to yearly rankings\n' +
                '- Year-end prizes awarded based on total points'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
        if (shadowGame) await shadowGame.tryShowError(message);
    },

    async displayCommunityRules(message) {
        const embed = new TerminalEmbed()
            .setTerminalTitle('COMMUNITY GUIDELINES')
            .setTerminalDescription('[COMMUNITY RULES & INFORMATION]')
            .addTerminalField('GENERAL CONDUCT',
                '1. Treat all members with respect\n' +
                '2. No harassment, discrimination, or hate speech\n' +
                '3. Keep discussions family-friendly\n' +
                '4. Follow channel topic guidelines\n' +
                '5. Listen to and respect admin/mod decisions'
            )
            .addTerminalField('CHALLENGE PARTICIPATION',
                '1. No cheating or exploitation of games\n' +
                '2. Report technical issues to admins\n' +
                '3. Submit scores/achievements honestly\n' +
                '4. Help maintain a fair competition\n' +
                '5. Celebrate others\' achievements'
            )
           .addTerminalField('COMMUNICATION CHANNELS',
    '**#general-chat**\n' +
    '- General discussion and community chat\n\n' +
    '**#retroachievements**\n' +
    '- Share your RA profile for verification\n\n' +
    '**#submissions**\n' +
    '- Submit arcade high scores with proof\n\n' +
    '**#monthly-challenge**\n' +
    '- Discuss current challenges\n' +
    '- Share tips and strategies\n\n' +
    '**#bot-terminal**\n' +
    '- All bot commands must be used here\n' +
    '- Keep other channels clear of bot commands'
)
.setTerminalFooter();
        
        await message.channel.send({ embeds: [embed] });
    }
};

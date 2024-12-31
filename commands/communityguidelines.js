const { TerminalEmbed } = require('../../utils/embedBuilder');

module.exports = {
    name: 'communityGuidelines',
    description: 'Displays the community guidelines in a terminal-style format',
    async execute(message) {
        const guidelinesChannel = await message.client.channels.fetch('1301710352261709895');

        const embed = new TerminalEmbed()
            .setTerminalTitle('COMMUNITY GUIDELINES')
            .setTerminalDescription('[TRANSMISSION INITIATED]\n[GUIDELINES FOR ENGAGEMENT]')
            .addTerminalField('RESPECT AND INCLUSION',
                '> Treat all members with respect and kindness\n' +
                '> Discrimination, harassment, or hate speech will not be tolerated\n' +
                '> Keep discussions friendly and inclusive for everyone')
            .addTerminalField('DISCORD ETIQUETTE',
                '> Use channels for their intended purposes\n' +
                '> Keep bot commands in #bot-terminal\n' +
                '> Avoid spamming or excessive self-promotion')
            .addTerminalField('RETROACHIEVEMENT RULES',
                '> All gameplay must use Hardcore Mode\n' +
                '> Any ties in challenges will be resolved through a multiplayer game chosen by participants\n' +
                '> Adhere to RetroAchievements.org guidelines for fair play')
            .addTerminalField('HIGH SCORE SUBMISSIONS',
                '> Screenshots for high scores must be clear and unedited\n' +
                '> Submit scores to the appropriate channels for validation\n' +
                '> Remember: the leaderboard runs until December 1st, 2025!')
            .addTerminalField('HELP AND SUPPORT',
                '> For questions or issues, tag a moderator or admin\n' +
                '> Report any breaches of guidelines immediately\n' +
                '> Let’s work together to maintain a positive space!')
            .addTerminalField('ENJOY YOURSELF',
                '> Have fun, share your progress, and celebrate retro gaming\n' +
                '> Engage in events, challenges, and discussions\n' +
                '> Your participation makes this community great!')
            .setTerminalFooter();

        await guidelinesChannel.send({ embeds: [embed] });
        await guidelinesChannel.send('```ansi\n\x1b[32m> Thank you for helping us create an amazing community\n[Ready for input]█\x1b[0m```');
    }
};

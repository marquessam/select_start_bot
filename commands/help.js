const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
    name: 'help',
    description: 'Shows all available commands',
    async execute(message, args, { shadowGame }) {
        await message.channel.send('```ansi\n\x1b[32m> Accessing terminal...\x1b[0m\n```');

        const embed = new TerminalEmbed()
            .setTerminalTitle('SELECT START TERMINAL')
            .setTerminalDescription(
                '\x1b[37mAVAILABLE COMMANDS:\x1b[0m\n\n' +
                '\x1b[37m=== CHALLENGE INFO ===\x1b[0m\n' +
                '\x1b[32m!challenge\x1b[0m - Display current challenge\n' +
                '\x1b[32m!leaderboard\x1b[0m - Display rankings (monthly, yearly, highscores)\n' +
                '\x1b[32m!nominations\x1b[0m - Display nominated games\n\n' +
                '\x1b[37m=== USER STATS ===\x1b[0m\n' +
                '\x1b[32m!profile <user>\x1b[0m - Access user achievement data\n' +
                '\x1b[32m!viewarchive <month>\x1b[0m - View historical rankings\n\n' +
                '\x1b[37m=== HIGH SCORES ===\x1b[0m\n' +
                '\x1b[32m!highscores\x1b[0m - View all game high scores\n\n' +
                '\x1b[37m=== GENERAL ===\x1b[0m\n' +
                '\x1b[32m!help\x1b[0m - Display available commands\n\n' +
                '\x1b[32m[Ready for input]█\x1b[0m'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
        await shadowGame.tryShowError(message);
    }
};

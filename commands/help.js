const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
    name: 'help',
    description: 'Shows all available commands',
    async execute(message, args, { shadowGame }) {
        await message.channel.send('```ansi\n\x1b[32m> Accessing terminal...\x1b[0m\n```');

        const embed = new TerminalEmbed()
            .setTerminalTitle('SELECT START TERMINAL')
            .setTerminalDescription(
                'AVAILABLE COMMANDS:\n\n' +
                '\x1b[37m=== CHALLENGE INFO ===\x1b[0m\n' +
                '!challenge - Display current challenge\n' +
                '!leaderboard - Display rankings (monthly, yearly, highscores)\n' +
                '!nominations - Display nominated games\n\n' +
                '\x1b[37m=== USER STATS ===\x1b[0m\n' +
                '!profile <user> - Access user achievement data\n' +
                '!viewarchive <month> - View historical rankings\n' +
                '\n\x1b[37m=== HIGH SCORES ===\x1b[0m\n' +
                '!highscores - View all game high scores\n\n' +
                '\x1b[37m=== GENERAL ===\x1b[0m\n' +
                '!help - Display available commands\n' +
                '\n[Ready for input]█'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
        await shadowGame.tryShowError(message);
    }
};

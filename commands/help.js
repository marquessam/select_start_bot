// commands/help.js
const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
    name: 'help',
    description: 'Shows all available commands',
    async execute(message, args, { shadowGame }) {
        await message.channel.send('```ansi\n\x1b[32m> Accessing terminal...\x1b[0m\n```');

        const embed = new TerminalEmbed()
            .setTerminalTitle('SELECT START TERMINAL')
            .setTerminalDescription(
                '\x1b[37m=== CHALLENGE INFO ===\x1b[0m\n' +
                '\x1b[32m!challenge - Display current monthly challenge\x1b[0m\n' +
                '\x1b[32m!leaderboard - View leaderboards (month/year)\x1b[0m\n' +
                '\x1b[32m!nominations - Display nominated games\x1b[0m\n\n' +
                '\x1b[37m=== USER STATS ===\x1b[0m\n' +
                '\x1b[32m!profile <user> - View user stats and progress\x1b[0m\n' +
                '\x1b[32m!viewarchive <month> - View historical rankings\x1b[0m\n\n' +
                '\x1b[37m=== ARCADE CHALLENGE ===\x1b[0m\n' +
                '\x1b[32m!arcade - View all arcade games and scores\x1b[0m\n' +
                '\x1b[32m!arcade <number> - View specific game rankings\x1b[0m\n' +
                '\x1b[37m=== REVIEWS ===\x1b[0m\n' +
                '\x1b[32m!review read - View reviews for games\x1b[0m\n' +
                '\x1b[32m!review write - Write reviews for games\x1b[0m\n\n' +
                '\x1b[37m=== GENERAL ===\x1b[0m\n' +
                '\x1b[32m!help - Display available commands\x1b[0m\n\n' +
                '\x1b[32m[Ready for input]█\x1b[0m'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
        await shadowGame.tryShowError(message);
    }
};

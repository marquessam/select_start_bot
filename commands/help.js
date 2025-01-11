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
                '\x1b[32m!challenge\x1b[0m - Display current monthly challenge\n' +
                '\x1b[32m!leaderboard\x1b[0m - View leaderboards (month/year)\n' +
                '\x1b[32m!nominations\x1b[0m - Display nominated games\n\n' +

                '\x1b[37m=== USER STATS ===\x1b[0m\n' +
                '\x1b[32m!profile <user>\x1b[0m - View user stats and progress\n' +
                '\x1b[32m!viewarchive <month>\x1b[0m - View historical rankings\n\n' +

                '\x1b[37m=== ARCADE CHALLENGE ===\x1b[0m\n' +
                '\x1b[32m!arcade\x1b[0m - View all arcade games and scores\n' +
                '\x1b[32m!arcade <number>\x1b[0m - View specific game rankings\n\n' +

                '\x1b[37m=== REVIEWS ===\x1b[0m\n' +
                '\x1b[32m!review read\x1b[0m - View reviews for games\n' +
                '\x1b[32m!review write <game title>\x1b[0m - Write a review for a specific game\n\n' +

                '\x1b[37m=== SEARCH ===\x1b[0m\n' +
                '\x1b[32m!search <game title>\x1b[0m - Search MobyGames for a game\n\n' +

                '\x1b[37m=== GENERAL ===\x1b[0m\n' +
                '\x1b[32m!help\x1b[0m - Display available commands\n\n' +

                '\x1b[32m[Ready for input]█\x1b[0m'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });

        if (shadowGame) {
            await shadowGame.tryShowError(message);
        }
    }
};

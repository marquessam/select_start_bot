const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
    name: 'help',
    description: 'Shows all available commands',
    async execute(message, args, { shadowGame }) {
        await message.channel.send('```ansi\n\x1b[32m> Accessing terminal...\x1b[0m\n```');

        const embed = new TerminalEmbed()
            .setTerminalTitle('SELECT START TERMINAL')
            .setTerminalDescription('[AVAILABLE COMMANDS]')
            .addTerminalField('AVAILABLE COMMANDS',
                '!rules - View all rules and information\n' +
                '!profile <user> - View user stats and progress\n' +
                '!leaderboard - View current rankings\n' +
                '!viewarchive <month> - View historical rankings'
            )
            .addTerminalField('ARCADE & REVIEWS', 
                '!arcade - View arcade games and scores\n' +
                '!arcade <number> - View specific game rankings\n' +
                '!review read - Browse game reviews\n' +
                '!review write <game> - Submit a game review'
            )
            .addTerminalField('NOMINATIONS & SEARCH',
                '!nominations view - View current nominations\n' +
                '!nominations add <platform> <game> - Submit nomination\n' +
                '!search <game> - Search for game information'
            )
            .addTerminalField('NOTES',
                '- All commands must be used in #bot-terminal\n' +
                '- Discord roles required for some features\n' +
                '- Use !rules for detailed information'
            )
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
        if (shadowGame?.tryShowError) await shadowGame.tryShowError(message);
    }
};

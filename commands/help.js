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
                '[Ready for input]█'
            )
            .setTerminalFooter();
            
        await message.channel.send({ embeds: [embed] });
        await shadowGame.tryShowError(message);
    }
};

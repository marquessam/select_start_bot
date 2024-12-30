const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'adminhelp',
    description: 'Shows all available commands including admin commands',
    async execute(message, args, { shadowGame }) {
        await message.channel.send('```ansi\n\x1b[32m> Accessing admin terminal...\x1b[0m\n```');
        
        const embed = new TerminalEmbed()
            .setTerminalTitle('ADMIN TERMINAL ACCESS')
            .setTerminalDescription(
                'ALL AVAILABLE COMMANDS:\n\n' +
                '=== CHALLENGE INFO ===\n' +
                '!challenge\nDisplay current challenge\n\n' +
                '!leaderboard\nDisplay achievement rankings\n\n' +
                '!nominations\nDisplay nominated games\n\n' +
                '=== USER STATS ===\n' +
                '!profile <user>\nAccess user achievement data\n\n' +
                '!yearlyboard\nDisplay yearly rankings\n\n' +
                '!viewarchive <month>\nView historical rankings\n\n' +
                '=== HIGH SCORES ===\n' +
                '!highscores\nView all game high scores\n\n' +
                '!addhighscore <game> <user> <score> <rank>\nSubmit a high score\n\n' +
                '=== POINTS MANAGEMENT ===\n' +
                '!addpoints <user> <points> <reason>\nAdd or remove points from a user\n\n' +
                '!addpointsall <points> <reason>\nAdd points to all participants\n\n' +
                '!addpointsmulti <points> <reason> <user1> <user2> ...\nAdd points to multiple users\n\n' +
                '!resetpoints <user>\nReset all points for a user\n\n' +
                '=== CHALLENGE MANAGEMENT ===\n' +
                '!updatemonth <month> <first> <second> <third>\nUpdate monthly rankings\n\n' +
                '!archivemonth\nArchive current rankings\n\n' +
                '!setnextchallenge\nInitialize setup for next month\'s challenge\n\n' +
                '!setnext <parameter> <value>\nSet next challenge details:\n' +
                '  - gameid <id>\n' +
                '  - name "<game name>"\n' +
                '  - icon <path>\n' +
                '  - dates <start> <end>\n\n' +
                '!switchchallenge\nSwitch to next challenge\n\n' +
                '=== TESTING ===\n' +
                '!testmonth\nTest monthly cycle with real data\n\n' +
                '!testwithoutarchive\nTest announcements without affecting data\n\n' +
                '!shadowreset\nReset Shadow Game Progress\n\n' +
                '[ADMIN ACCESS GRANTED]█'
            )
            .setTerminalFooter();
            
        await message.channel.send({ embeds: [embed] });
    }
};

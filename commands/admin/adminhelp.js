// commands/admin/adminhelp.js
const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'adminhelp',
    description: 'Shows all available admin commands',
    async execute(message, args, { shadowGame }) {
        await message.channel.send('```ansi\n\x1b[32m> Accessing admin terminal...\x1b[0m\n```');
        
        const embed = new TerminalEmbed()
            .setTerminalTitle('ADMIN TERMINAL ACCESS')
            .setTerminalDescription(
                '\x1b[37m=== POINTS MANAGEMENT ===\x1b[0m\n' +
                '\x1b[32m!addpoints <user> <points> <reason>\x1b[0m\nAdd/remove points from a user\n' +
                '\x1b[32m!addpointsall <points> <reason>\x1b[0m\nAdd points to all participants\n' +
                '\x1b[32m!addpointsmulti <points> <reason> <user1> <user2> ...\x1b[0m\nAdd points to multiple users\n' +
                '\x1b[32m!resetpoints <user>\x1b[0m\nReset all points for a user\n\n' +

                '\x1b[37m=== CHALLENGE MANAGEMENT ===\x1b[0m\n' +
                '\x1b[32m!updatemonth <month> <first> <second> <third>\x1b[0m\nUpdate monthly rankings\n' +
                '\x1b[32m!archivemonth\x1b[0m\nArchive current rankings\n' +
                '\x1b[32m!setnextchallenge\x1b[0m\nInitialize setup for next month\n' +
                '\x1b[32m!setnext <parameter> <value>\x1b[0m\nSet next challenge details\n' +
                '\x1b[32m!switchchallenge\x1b[0m\nSwitch to next challenge\n\n' +

                '\x1b[37m=== ARCADE MANAGEMENT ===\x1b[0m\n' +
                '\x1b[32m!addhighscore\x1b[0m\nAdd or update high scores\n' +
                '\x1b[32m!updategamerules\x1b[0m\nUpdate rules for arcade games\n' +
                '\x1b[32m!managegames\x1b[0m\nManage arcade game list\n\n' +

                '\x1b[37m=== USER MANAGEMENT ===\x1b[0m\n' +
                '\x1b[32m!removeuser <username>\x1b[0m\nRemove a user from the system\n\n' +

                '\x1b[37m=== RETROACTIVE UPDATES ===\x1b[0m\n' +
                '\x1b[32m!awardretropoints <month> "<game name>"\x1b[0m\nAward missing participation points\n\n' +

                '\x1b[37m=== TESTING ===\x1b[0m\n' +
                '\x1b[32m!testmonth\x1b[0m\nTest monthly cycle with real data\n' +
                '\x1b[32m!testwithoutarchive\x1b[0m\nTest announcements without affecting data\n\n' +

                '\x1b[37m=== SHADOW GAME ===\x1b[0m\n' +
                '\x1b[32m!shadowreset\x1b[0m\nReset Shadow Game progress\n\n' +
                '\x1b[32m[ADMIN ACCESS GRANTED]█\x1b[0m'
            )
            .setTerminalFooter();
            
        await message.channel.send({ embeds: [embed] });
    }
};

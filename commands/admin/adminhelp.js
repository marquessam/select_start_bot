// commands/admin/adminhelp.js
module.exports = {
    name: 'adminhelp',
    description: 'Shows all available admin commands',
    async execute(message, args, { shadowGame }) {
        await message.channel.send('```ansi\n\x1b[32m> Accessing admin terminal...\x1b[0m\n```');
        
        const embed = new TerminalEmbed()
            .setTerminalTitle('ADMIN TERMINAL ACCESS')
            .setTerminalDescription(
                '=== POINTS MANAGEMENT ===\n' +
                '!addpoints <user> <points> <reason>\nAdd/remove points from user\n\n' +
                '!addpointsall <points> <reason>\nAdd points to all participants\n\n' +
                '!addpointsmulti <points> <reason> <user1> <user2> ...\nAdd points to multiple users\n\n' +
                '!resetpoints <user>\nReset all points for user\n\n' +
                '=== CHALLENGE MANAGEMENT ===\n' +
                '!updatemonth <month> <first> <second> <third>\nUpdate monthly rankings\n\n' +
                '!archivemonth\nArchive current rankings\n\n' +
                '!setnextchallenge\nInitialize setup for next month\n\n' +
                '!setnext <parameter> <value>\nSet next challenge details\n\n' +
                '!switchchallenge\nSwitch to next challenge\n\n' +
                '=== ARCADE MANAGEMENT ===\n' +
                '!addscore <game> <user> <score>\nAdd/update arcade score\n\n' +
                '!inithighscores\nInitialize arcade scoreboard\n\n' +
                '=== USER MANAGEMENT ===\n' +
                '!removeuser <username>\nRemove user from system\n\n' +
                '=== RETROACTIVE UPDATES ===\n' +
                '!awardretropoints <month> "<game name>"\nAward missing participation points\n\n' +
                '=== TESTING ===\n' +
                '!testmonth\nTest monthly cycle with real data\n\n' +
                '!testwithoutarchive\nTest announcements without affecting data\n\n' +
                '=== SHADOW GAME ===\n' +
                '!shadowreset\nReset Shadow Game Progress\n\n' +
                '[ADMIN ACCESS GRANTED]█'
            )
            .setTerminalFooter();
            
        await message.channel.send({ embeds: [embed] });
    }
};

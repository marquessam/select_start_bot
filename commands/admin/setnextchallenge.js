// setnextchallenge.js
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'setnextchallenge',
    description: 'Set up the next monthly challenge',
    async execute(message, args, { userStats }) {
        try {
            // Create empty next challenge template
            const nextChallenge = {
                gameId: "",
                gameName: "",
                gameIcon: "",
                startDate: "",
                endDate: "",
                rules: [
                    "Hardcore mode must be enabled",
                    "All achievements are eligible",
                    "Progress tracked via retroachievements",
                    "No hacks/save states/cheats allowed"
                ],
                points: {
                    first: 6,
                    second: 4,
                    third: 2
                }
            };

            // Save empty template to database
            await database.saveNextChallenge(nextChallenge);
            
            // Display setup prompt
            const embed = new TerminalEmbed()
                .setTerminalTitle('NEXT CHALLENGE SETUP')
                .setTerminalDescription('[SETUP REQUIRED]\n[FOLLOW PROMPTS]')
                .addTerminalField('REQUIRED INFORMATION',
                    'Please use the following commands to set up the next challenge:\n\n' +
                    '!setnext gameid <id>\n' +
                    '!setnext name "<game name>"\n' +
                    '!setnext icon <icon_path>\n' +
                    '!setnext dates <start> <end>')
                .setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Template initialized in database\n[Ready for input]█\x1b[0m```');
            
        } catch (error) {
            console.error('Set Next Challenge Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to set up next challenge\n[Ready for input]█\x1b[0m```');
        }
    }
};

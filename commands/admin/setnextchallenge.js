const TerminalEmbed = require('../../utils/embedBuilder');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: 'setnextchallenge',
    description: 'Set up the next monthly challenge',
    async execute(message, args, { userStats }) {
        try {
            // Load both current and next challenge files
            const nextChallengePath = path.join(__dirname, '../../nextChallenge.json');
            
            // Example challenge data structure
            const nextChallenge = {
                currentChallenge: {
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
                        first: 10,
                        second: 6,
                        third: 3
                    }
                }
            };

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

            // Save empty template if it doesn't exist
            await fs.writeFile(nextChallengePath, JSON.stringify(nextChallenge, null, 2));
            
        } catch (error) {
            console.error('Set Next Challenge Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to set up next challenge\n[Ready for input]█\x1b[0m```');
        }
    }
};

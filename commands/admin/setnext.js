// setnext.js
const TerminalEmbed = require('../../utils/embedBuilder');
const database = require('../../database');

module.exports = {
    name: 'setnext',
    description: 'Set next challenge parameters',
    async execute(message, args, { userStats }) {
        try {
            if (args.length < 2) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUse !setnextchallenge for help\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Get current next challenge from database
            let nextChallenge = await database.getNextChallenge();
            if (!nextChallenge) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No next challenge template found\nUse !setnextchallenge first\n[Ready for input]█\x1b[0m```');
                return;
            }

            const [param, ...values] = args;

            switch(param) {
                case 'gameid':
                    nextChallenge.gameId = values[0];
                    break;
                case 'name':
                    nextChallenge.gameName = values.join(' ');
                    break;
                case 'icon':
                    nextChallenge.gameIcon = values[0];
                    break;
                case 'dates':
                    if (values.length !== 2) {
                        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid dates format\nUse: !setnext dates <start> <end>\n[Ready for input]█\x1b[0m```');
                        return;
                    }
                    nextChallenge.startDate = values[0];
                    nextChallenge.endDate = values[1];
                    break;
                default:
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid parameter\nUse !setnextchallenge for help\n[Ready for input]█\x1b[0m```');
                    return;
            }

            await database.saveNextChallenge(nextChallenge);

            const embed = new TerminalEmbed()
                .setTerminalTitle('NEXT CHALLENGE UPDATED')
                .setTerminalDescription('[UPDATE SUCCESSFUL]')
                .addTerminalField('UPDATED PARAMETER', `${param.toUpperCase()}: ${values.join(' ')}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Set Next Parameter Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to update parameter\n[Ready for input]█\x1b[0m```');
        }
    }
};

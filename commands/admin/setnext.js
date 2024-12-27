const TerminalEmbed = require('../../utils/embedBuilder');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: 'setnext',
    description: 'Set next challenge parameters',
    async execute(message, args, { userStats }) {
        try {
            if (args.length < 2) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUse !setnextchallenge for help\n[Ready for input]█\x1b[0m```');
                return;
            }

            const nextChallengePath = path.join(__dirname, '../../nextChallenge.json');
            let nextChallenge = JSON.parse(await fs.readFile(nextChallengePath, 'utf8'));
            const [param, ...values] = args;

            switch(param) {
                case 'gameid':
                    nextChallenge.currentChallenge.gameId = values[0];
                    break;
                case 'name':
                    nextChallenge.currentChallenge.gameName = values.join(' ');
                    break;
                case 'icon':
                    nextChallenge.currentChallenge.gameIcon = values[0];
                    break;
                case 'dates':
                    if (values.length !== 2) {
                        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid dates format\nUse: !setnext dates <start> <end>\n[Ready for input]█\x1b[0m```');
                        return;
                    }
                    nextChallenge.currentChallenge.startDate = values[0];
                    nextChallenge.currentChallenge.endDate = values[1];
                    break;
                default:
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid parameter\nUse !setnextchallenge for help\n[Ready for input]█\x1b[0m```');
                    return;
            }

            await fs.writeFile(nextChallengePath, JSON.stringify(nextChallenge, null, 2));

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

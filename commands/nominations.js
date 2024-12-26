const TerminalEmbed = require('../utils/embedBuilder');
const { fetchNominations } = require('../raAPI.js');

module.exports = {
    name: 'nominations',
    description: 'Displays nominated games',
    async execute(message, args, { shadowGame }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing nominations database...\x1b[0m\n```');
            
            const nominations = await fetchNominations();
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('NOMINATED TITLES')
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING NOMINATIONS BY PLATFORM]');

            for (const [platform, games] of Object.entries(nominations).sort()) {
                if (games.length > 0) {
                    embed.addTerminalField(
                        `PLATFORM: ${platform.toUpperCase()}`,
                        games.map(game => `> ${game}`).join('\n')
                    );
                }
            }

            embed.setTerminalFooter();
            
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !challenge to view current challenge\n[Ready for input]█\x1b[0m```');
            await shadowGame.tryShowError(message);
        } catch (error) {
            console.error('Nominations Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Unable to access nominations\n[Ready for input]█\x1b[0m```');
        }
    }
};

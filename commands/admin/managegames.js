// commands/admin/managegames.js
import TerminalEmbed = require('../../utils/embedBuilder.js');

export default {
    name: 'managegames',
    description: 'Manage game requests and approvals',
    async execute(message, args) {
        try {
            if (!args.length) {
                const requests = await database.getGameRequests();
                
                const embed = new TerminalEmbed()
                    .setTerminalTitle('GAME REQUESTS')
                    .setTerminalDescription('[PENDING APPROVAL]');

                if (requests.pending.length > 0) {
                    embed.addTerminalField('PENDING REQUESTS',
                        requests.pending.map((req, i) => 
                            `${i + 1}. ${req.gameName} (by ${req.requestedBy})`
                        ).join('\n'));
                } else {
                    embed.addTerminalField('STATUS', 'No pending requests');
                }

                embed.addTerminalField('USAGE',
                    '!managegames approve <number> - Approve a game request\n' +
                    '!managegames deny <number> - Deny a game request')
                    .setTerminalFooter();

                await message.channel.send({ embeds: [embed] });
                return;
            }

            const action = args[0].toLowerCase();
            const index = parseInt(args[1]) - 1;

            if (action === 'approve' || action === 'deny') {
                const requests = await database.getGameRequests();
                if (index < 0 || index >= requests.pending.length) {
                    await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid request number\n[Ready for input]█\x1b[0m```');
                    return;
                }

                const request = requests.pending[index];

                if (action === 'approve') {
                    await database.approveGame(request.gameName);
                    await message.channel.send(`\`\`\`ansi\n\x1b[32mApproved: ${request.gameName}\n[Ready for input]█\x1b[0m\`\`\``);
                } else {
                    // Remove from pending without adding to approved
                    await database.denyGame(request.gameName);
                    await message.channel.send(`\`\`\`ansi\n\x1b[32mDenied: ${request.gameName}\n[Ready for input]█\x1b[0m\`\`\``);
                }
            }

        } catch (error) {
            console.error('Manage Games Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to manage games\n[Ready for input]█\x1b[0m```');
        }
    }
};

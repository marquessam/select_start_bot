// commands/admin/event.js

const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'event',
    description: 'Manage scheduled events',
    async execute(message, args, { eventTimer }) {
        // Admin check
        const hasPermission = message.member && (
            message.member.permissions.has('Administrator') ||
            message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)
        );

        if (!hasPermission) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
            return;
        }

        if (!args.length) {
            return await showHelp(message);
        }

        try {
            const subcommand = args[0].toLowerCase();

            switch(subcommand) {
                case 'create':
                    if (args.length < 4) {
                        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !event create <name> <cron pattern> <message>\n[Ready for input]█\x1b[0m```');
                        return;
                    }
                    const [, name, pattern, ...messageArgs] = args;
                    eventTimer.createEvent(name, pattern, messageArgs.join(' '));
                    await message.channel.send(`Event "${name}" scheduled successfully.`);
                    break;

                case 'stop':
                    if (args.length < 2) {
                        await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !event stop <name>\n[Ready for input]█\x1b[0m```');
                        return;
                    }
                    const stopped = eventTimer.stopEvent(args[1]);
                    await message.channel.send(stopped ? 
                        `Event "${args[1]}" stopped successfully.` : 
                        `No event found with name "${args[1]}".`
                    );
                    break;

                default:
                    await showHelp(message);
            }
        } catch (error) {
            console.error('Event Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to manage event\n[Ready for input]█\x1b[0m```');
        }
    }
};

async function showHelp(message) {
    const embed = new TerminalEmbed()
        .setTerminalTitle('EVENT MANAGEMENT')
        .setTerminalDescription('[COMMAND USAGE]')
        .addTerminalField('COMMANDS',
            '!event create <name> <cron pattern> <message> - Create new event\n' +
            '!event stop <name> - Stop an event')
        .addTerminalField('EXAMPLES',
            '!event create voting "0 12 23 * *" "Voting begins in 24 hours!"\n' +
            '!event stop voting')
        .addTerminalField('CRON PATTERNS',
            'Minute Hour Day Month Day-of-week\n' +
            '0 12 * * * - Every day at noon\n' +
            '0 0 1 * * - First of every month\n' +
            '0 12 23 * * - 23rd of every month at noon')
        .setTerminalFooter();

    await message.channel.send({ embeds: [embed] });
}

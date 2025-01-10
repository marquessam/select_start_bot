// commands/admin/awardretropoints.js
import TerminalEmbed = require('../../utils/embedBuilder.js');
import database = require('../../database.js');

export default = {
    name: 'awardretropoints',
    description: 'Award retroactive participation points for a specific month',
    async execute(message, args, { userStats }) {
        try {
            if (args.length < 2) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid syntax\nUsage: !awardretropoints <month> "<game name>"\nExample: !awardretropoints December "Final Fantasy Tactics"\n[Ready for input]█\x1b[0m```');
                return;
            }

            const month = args[0];
            const gameName = args.slice(1).join(' ').replace(/['"]/g, ''); // Remove quotes if present
            const currentYear = new Date().getFullYear().toString();

            await message.channel.send('```ansi\n\x1b[32m> Processing retroactive points...\x1b[0m\n```');

            // Get all users
            const users = await userStats.getAllUsers();
            let pointsAwarded = 0;
            let usersProcessed = [];

            for (const username of users) {
                const user = await userStats.getUserStats(username);
                if (!user) continue;

                // Check if user participated in that month
                const monthIndex = new Date(`${month} 1, ${currentYear}`).getMonth();
                const participationKey = `${currentYear}-${monthIndex}`;

                if (user.participationMonths?.includes(participationKey)) {
                    // Check if participation point was already awarded
                    const bonusExists = user.bonusPoints?.some(bonus => 
                        bonus.reason === `${gameName} - participation` && 
                        bonus.year === currentYear &&
                        new Date(bonus.date).getMonth() === monthIndex
                    );

                    if (!bonusExists) {
                        await userStats.addBonusPoints(
                            username,
                            1,
                            `${gameName} - participation`
                        );
                        pointsAwarded++;
                        usersProcessed.push(username);
                    }
                }
            }

            const embed = new TerminalEmbed()
                .setTerminalTitle('RETROACTIVE POINTS AWARDED')
                .setTerminalDescription('[POINTS PROCESSING COMPLETE]\n[VERIFYING RESULTS]')
                .addTerminalField('OPERATION DETAILS', 
                    `MONTH: ${month}\n` +
                    `GAME: ${gameName}\n` +
                    `POINTS AWARDED: ${pointsAwarded}\n` +
                    `USERS PROCESSED: ${usersProcessed.length}`)
                .addTerminalField('USERS UPDATED',
                    usersProcessed.length > 0 ? usersProcessed.join(', ') : 'None')
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !profile <username> to verify points\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Award Retroactive Points Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to award retroactive points\n[Ready for input]█\x1b[0m```');
        }
    }
};

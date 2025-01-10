// archivemonth.js
import TerminalEmbed from '../../utils/embedBuilder.js';
import { fetchLeaderboardData }from '../../raAPI.js';
import database from '../../database.js';

export default {
    name: 'archivemonth',
    description: 'Archives current leaderboard standings',
    async execute(message, args, { userStats }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Archiving current leaderboard...\x1b[0m\n```');
            
            const data = await fetchLeaderboardData();
            const archiveResult = await userStats.archiveLeaderboard(data);
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('LEADERBOARD ARCHIVED')
                .setTerminalDescription('[ARCHIVE COMPLETE]\n[DATA STORED SUCCESSFULLY]')
                .addTerminalField('ARCHIVE DETAILS',
                    `MONTH: ${archiveResult.month}\n` +
                    `YEAR: ${archiveResult.year}\n` +
                    `ENTRIES: ${archiveResult.rankings.length}`)
                .setTerminalFooter();

            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Type !viewarchive <month> to view archived data\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            console.error('Archive Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to archive leaderboard\n[Ready for input]█\x1b[0m```');
        }
    }
};

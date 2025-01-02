const TerminalEmbed = require('../utils/embedBuilder');
const leaderboardCache = require('../leaderboardCache');
const { fetchUserProfile } = require('../raAPI');

module.exports = {
    name: 'profile',
    description: 'Displays enhanced user profile and stats',
    async execute(message, args) {
        try {
            const username = args[0];
            if (!username) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Invalid query\nSyntax: !profile <username>\n[Ready for input]█\x1b[0m```');
                return;
            }

            await message.channel.send('```ansi\n\x1b[32m> Accessing user records...\x1b[0m\n```');

            const currentYear = new Date().getFullYear().toString();

            // Fetch data from leaderboard cache and profile
            const yearlyLeaderboard = leaderboardCache.getYearlyLeaderboard() || [];
            const monthlyLeaderboard = leaderboardCache.getMonthlyLeaderboard() || [];
            const userProfile = await fetchUserProfile(username);

            // Find user's rank and stats in leaderboards
            const yearlyRank = yearlyLeaderboard.findIndex(user => user.username.toLowerCase() === username.toLowerCase()) + 1;
            const monthlyRank = monthlyLeaderboard.findIndex(user => user.username.toLowerCase() === username.toLowerCase()) + 1;

            const yearlyRankText = yearlyRank
                ? `${yearlyRank}/${yearlyLeaderboard.length}`
                : 'N/A';

            const monthlyRankText = monthlyRank
                ? `${monthlyRank}/${monthlyLeaderboard.length}`
                : 'N/A';

            const embed = new TerminalEmbed()
                .setTerminalTitle(`USER PROFILE: ${username}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING USER STATISTICS]')
                .addTerminalField('CURRENT CHALLENGE PROGRESS',
                    `GAME: ${leaderboardCache.getMonthlyGame()?.Title || 'N/A'}\n` +
                    `PROGRESS: ${monthlyLeaderboard.find(user => user.username.toLowerCase() === username.toLowerCase())?.completionPercentage || 0}%`)
                .addTerminalField('RANKINGS',
                    `MONTHLY RANK: ${monthlyRankText}\n` +
                    `YEARLY RANK: ${yearlyRankText}`);

            if (userProfile.profileImage && userProfile.profileImage.startsWith('http')) {
                embed.setThumbnail(userProfile.profileImage);
            }

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Database connection secure\n[Ready for input]█\x1b[0m```');
        } catch (error) {
            console.error('Profile Command Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve profile\n[Ready for input]█\x1b[0m```');
        }
    }
};

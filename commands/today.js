// commands/today.js
const TerminalEmbed = require('../utils/embedBuilder');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
    name: 'today',
    description: 'Shows games released on this day in gaming history',
    async execute(message, args, { mobyAPI }) {
        try {
            await message.channel.send('```ansi\n\x1b[32m> Accessing gaming history database...\x1b[0m\n```');

            const data = await mobyAPI.getThisDay();
            if (!data || !data.games || data.games.length === 0) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No historical data found for today\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Sort games by year
            const sortedGames = data.games.sort((a, b) => {
                const yearA = new Date(a.first_release_date).getFullYear();
                const yearB = new Date(b.first_release_date).getFullYear();
                return yearA - yearB;
            });

            const today = new Date();
            const month = today.toLocaleString('default', { month: 'long' });
            const day = today.getDate();

            const embed = new TerminalEmbed()
                .setTerminalTitle(`THIS DAY IN GAMING: ${month} ${day}`)
                .setTerminalDescription('[DATABASE ACCESS GRANTED]\n[DISPLAYING HISTORICAL RELEASES]');

            // Group games by decade for better organization
            const gamesByDecade = sortedGames.reduce((acc, game) => {
                const year = new Date(game.first_release_date).getFullYear();
                const decade = Math.floor(year / 10) * 10;
                if (!acc[decade]) acc[decade] = [];
                acc[decade].push(game);
                return acc;
            }, {});

            // Add each decade's games to the embed
            Object.entries(gamesByDecade)
                .sort(([decadeA], [decadeB]) => decadeB - decadeA) // Sort decades newest to oldest
                .forEach(([decade, games]) => {
                    const gameList = games
                        .map(game => {
                            const year = new Date(game.first_release_date).getFullYear();
                            return `${year} - ${game.title} (${game.platforms.map(p => p.platform_name).join(', ')})`;
                        })
                        .join('\n');

                    embed.addTerminalField(`${decade}s`, gameList);
                });

            embed.setTerminalFooter();
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('```ansi\n\x1b[32m> Historical data retrieved successfully\n[Ready for input]█\x1b[0m```');

        } catch (error) {
            ErrorHandler.logError(error, 'Today in Gaming Command');
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve historical data\n[Ready for input]█\x1b[0m```');
        }
    }
};

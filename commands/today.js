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
            const gamesByDecade = {};
            for (const game of sortedGames) {
                const year = new Date(game.first_release_date).getFullYear();
                const decade = Math.floor(year / 10) * 10;
                if (!gamesByDecade[decade]) {
                    gamesByDecade[decade] = [];
                }
                gamesByDecade[decade].push(game);
            }

            // Add each decade's games to the embed
            Object.keys(gamesByDecade)
                .sort((a, b) => b - a) // Sort decades newest to oldest
                .forEach(decade => {
                    const games = gamesByDecade[decade];
                    const gameList = games
                        .map(game => {
                            const year = new Date(game.first_release_date).getFullYear();
                            const platforms = Array.isArray(game.platforms) 
                                ? game.platforms.map(p => p.platform_name).join(', ')
                                : 'Unknown Platform';
                            return `${year} - ${game.title} (${platforms})`;
                        })
                        .join('\n');

                    if (gameList) {
                        embed.addTerminalField(`${decade}s`, gameList);
                    }
                });

            // Add footer if we have data
            if (Object.keys(gamesByDecade).length > 0) {
                embed.setTerminalFooter();
                await message.channel.send({ embeds: [embed] });
                await message.channel.send('```ansi\n\x1b[32m> Historical data retrieved successfully\n[Ready for input]█\x1b[0m```');
            } else {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No historical data found for today\n[Ready for input]█\x1b[0m```');
            }

        } catch (error) {
            console.error('Today in Gaming Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve historical data\n[Ready for input]█\x1b[0m```');
        }
    }
};

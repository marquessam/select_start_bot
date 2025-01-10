// commands/today.js
import TerminalEmbed from '../utils/embedBuilder.js';

export default {
    name: 'today',
    description: 'Shows games released on this day in gaming history',
    
    // Helper function to split long text into chunks
    splitIntoChunks(text, maxLength) {
        const chunks = [];
        const lines = text.split('\n');
        let currentChunk = '';

        for (const line of lines) {
            if (currentChunk.length + line.length + 1 > maxLength) {
                chunks.push(currentChunk.trim());
                currentChunk = line;
            } else {
                currentChunk += (currentChunk ? '\n' : '') + line;
            }
        }
        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }
        return chunks;
    },

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

            // Group games by decade
            const gamesByDecade = {};
            for (const game of sortedGames) {
                const year = new Date(game.first_release_date).getFullYear();
                if (!isNaN(year)) { // Only process valid years
                    const decade = Math.floor(year / 10) * 10;
                    if (!gamesByDecade[decade]) {
                        gamesByDecade[decade] = [];
                    }
                    const platforms = Array.isArray(game.platforms) 
                        ? game.platforms.map(p => p.platform_name).join(', ')
                        : 'Unknown Platform';
                    gamesByDecade[decade].push(`${year} - ${game.title} (${platforms})`);
                }
            }

            // Process each decade
            const decadeKeys = Object.keys(gamesByDecade).sort((a, b) => b - a);
            for (const decade of decadeKeys) {
                const gamesList = gamesByDecade[decade].join('\n');
                
                // Split long lists into multiple fields
                const chunks = this.splitIntoChunks(gamesList, 900); // Using 900 to be safe
                chunks.forEach((chunk, index) => {
                    const fieldName = chunks.length > 1 
                        ? `${decade}s (Part ${index + 1})`
                        : `${decade}s`;
                    embed.addTerminalField(fieldName, chunk);
                });
            }

            if (decadeKeys.length > 0) {
                embed.setTerminalFooter();
                await message.channel.send({ embeds: [embed] });
                await message.channel.send('```ansi\n\x1b[32m> Historical data retrieved successfully\n[Ready for input]█\x1b[0m```');
            } else {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No valid historical data found for today\n[Ready for input]█\x1b[0m```');
            }

        } catch (error) {
            console.error('Today in Gaming Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to retrieve historical data\n[Ready for input]█\x1b[0m```');
        }
    }
};

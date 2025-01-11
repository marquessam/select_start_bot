// commands/search.js
const TerminalEmbed = require('../utils/embedBuilder');

module.exports = {
  name: 'search',
  description: 'Search for a game on MobyGames and display info + box art',

  // The 'execute' method is called with (message, args, context)
  // Make sure you're passing { mobyAPI } in 'context'
  async execute(message, args, { mobyAPI }) {
    try {
      // 1) Check if user provided a search query
      if (!args.length) {
        return message.channel.send(
          '```ansi\n\x1b[32m[ERROR] Please provide a game title to search for.\n[Ready for input]█\x1b[0m```'
        );
      }

      // 2) Combine args into a single string
      const query = args.join(' ');

      // 3) Let the user know we're searching
      await message.channel.send(
        '```ansi\n\x1b[32m> Searching MobyGames database...\x1b[0m\n```'
      );

      // 4) Call our MobyAPI search
      const result = await mobyAPI.searchGames(query);

      // result should look like: { "games": [ ... ] } in normal format
      if (!result || !Array.isArray(result.games) || result.games.length === 0) {
        return message.channel.send(
          '```ansi\n\x1b[32m[ERROR] No results found for that title.\n[Ready for input]█\x1b[0m```'
        );
      }

      // 5) Take the *first* matching game
      const game = result.games[0];

      // Remove HTML tags from the description
      const sanitizeDescription = (description) => {
        return description.replace(/<[^>]*>/g, '').trim();
      };

      // Build the MobyGames game link
      const gameLink = `https://www.mobygames.com/game/${game.id}/${game.title.replace(/\s+/g, '-').toLowerCase()}`;

      // 6) Build an embed (terminal-style) with data from the first game
      const embed = new TerminalEmbed()
        .setTerminalTitle(game.title)
        .setTerminalDescription(
          game.description
            ? sanitizeDescription(game.description.slice(0, 300)) + `... [Read more](${gameLink})`
            : `No description available. [More Info](${gameLink})`
        );

      // 7) Add a large image if it exists (instead of a thumbnail)
      if (game.sample_cover && game.sample_cover.image) {
        embed.setImage(game.sample_cover.image);
      }

      // 8) Show some extra details (platforms, genres, developer, publisher, etc.)
      if (Array.isArray(game.platforms) && game.platforms.length > 0) {
        const platformList = game.platforms
          .map((p) => `${p.platform_name} (${p.first_release_date || 'N/A'})`)
          .join('\n');
        embed.addTerminalField('Platforms', platformList);
      }

      if (Array.isArray(game.genres) && game.genres.length > 0) {
        const genreList = game.genres.map((g) => g.genre_name).join(', ');
        embed.addTerminalField('Genres', genreList);
      }

      if (game.developer) {
        embed.addTerminalField('Developer', game.developer);
      }

      if (game.publisher) {
        embed.addTerminalField('Publisher', game.publisher);
      }

      // 9) Attribution message
      embed.setTerminalFooter('Data provided by MobyGames');

      // 10) Send the embed to the channel
      await message.channel.send({ embeds: [embed] });

      // 11) Done
      await message.channel.send(
        '```ansi\n\x1b[32m> Search complete\n[Ready for input]█\x1b[0m```'
      );
    } catch (error) {
      console.error('MobyGames Search Error:', error);
      await message.channel.send(
        '```ansi\n\x1b[32m[ERROR] Something went wrong during the search\n[Ready for input]█\x1b[0m```'
      );
    }
  },
};


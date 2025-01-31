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
      const userQuery = args.join(' ');

      // 3) Let the user know we're searching
      await message.channel.send(
        '```ansi\n\x1b[32m> Searching MobyGames database...\x1b[0m\n```'
      );

      // 4) Perform initial search
      let result = await mobyAPI.searchGames(userQuery);

      // 5) If no results, do a fallback replacement (e.g., pokemon -> pokémon), then search again
      if (!result || !Array.isArray(result.games) || result.games.length === 0) {
        // simple example: fix "pokemon" -> "pokémon" (case-insensitive)
        const fallbackQuery = fixKnownTitles(userQuery);

        // Only attempt if fallback changed something
        if (fallbackQuery !== userQuery) {
          console.log(`Fuzzy fallback: "${userQuery}" => "${fallbackQuery}"`);
          result = await mobyAPI.searchGames(fallbackQuery);
        }
      }

      // 6) Validate final result format
      if (!result || !Array.isArray(result.games) || result.games.length === 0) {
        return message.channel.send(
          '```ansi\n\x1b[32m[ERROR] No results found for that title.\n[Ready for input]█\x1b[0m```'
        );
      }

      // If there is more than one match, let the user pick from the top few
      const MAX_CHOICES = 5;
      const gamesFound = result.games.slice(0, MAX_CHOICES);

      if (gamesFound.length > 1) {
        // List possible choices
        const choicesList = gamesFound
          .map((g, index) => `${index + 1}. ${g.title}`)
          .join('\n');

        await message.channel.send(
          '```ansi\n\x1b[32mMultiple matches found:\n' +
            `${choicesList}\n\n` +
            'Enter the number of the game you want to view.\n' +
            '[Ready for input]█\x1b[0m```'
        );

        // Collect user response (one message)
        const filter = (m) => m.author.id === message.author.id && !isNaN(m.content);
        const collected = await message.channel.awaitMessages({
          filter,
          max: 1,
          time: 30000, // 30 seconds to pick
        });

        if (!collected.size) {
          return message.channel.send(
            '```ansi\n\x1b[32m[ERROR] No response received. Command timed out.\n[Ready for input]█\x1b[0m```'
          );
        }

        const choice = parseInt(collected.first().content, 10);
        if (choice < 1 || choice > gamesFound.length) {
          return message.channel.send(
            '```ansi\n\x1b[32m[ERROR] Invalid choice.\n[Ready for input]█\x1b[0m```'
          );
        }

        // Use the chosen game
        const selectedGame = gamesFound[choice - 1];
        await this.displayGame(message, selectedGame);
      } else {
        // Only one match, just display it
        await this.displayGame(message, gamesFound[0]);
      }

    } catch (error) {
      console.error('MobyGames Search Error:', error);
      await message.channel.send(
        '```ansi\n\x1b[32m[ERROR] Something went wrong during the search\n[Ready for input]█\x1b[0m```'
      );
    }
  },

  /**
   * Helper method to create and send the embed for a given game object
   */
 async displayGame(message, game) {
    // Remove HTML tags from the description
    const sanitizeDescription = (description) => {
        return description.replace(/<[^>]*>/g, '').trim();
    };

   const gameLink = `https://www.mobygames.com/game/${game.game_id}/${game.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;

// Add clickable link in the game info
const embed = new TerminalEmbed()
    .setTerminalTitle(game.title)
    .setTerminalDescription(
        game.description
            ? `${sanitizeDescription(game.description.slice(0, 300))}... [Read more](${gameLink})`
            : `No description available.\n\n[View on MobyGames](${gameLink})`
    );

    // Add a large image if it exists (instead of a thumbnail)
    if (game.sample_cover && game.sample_cover.image) {
      embed.setImage(game.sample_cover.image);
    }

    // Show some extra details (platforms, genres, developer, publisher, etc.)
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

    // Attribution message
    embed.setTerminalFooter('Data provided by MobyGames');

    // Send the embed to the channel
    await message.channel.send({ embeds: [embed] });

    // Done
    await message.channel.send(
      '```ansi\n\x1b[32m> ROYAL ARCHIVES Search complete\n[Ready for input] [C4Y2XQ] █\x1b[0m```'
    );
  },
};

/**
 * fixKnownTitles(query)
 * A simple helper that does naive replacements for known diacritical issues.
 * You can add more replacements for other franchises as needed.
 */
function fixKnownTitles(query) {
  // Example: fix "pokemon" -> "pokémon"
  // The \b ensures we match "pokemon" as a whole word, ignoring case
  return query.replace(/\bpokemon\b/i, 'pokémon');
}

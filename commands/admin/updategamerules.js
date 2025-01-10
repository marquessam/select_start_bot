import database from '../../database.js'; // Adjust the path as needed

export default {
    name: 'updategamerules',
    description: 'Update game rules in the arcade challenge.',
    async execute(message) {
        try {
            const filter = m => m.author.id === message.author.id;
            const timeout = 30000; // 30 seconds timeout for each prompt

            // Step 1: Ask for the game name
            await message.channel.send('```ansi\n\x1b[32mEnter the name of the game you want to update rules for:\x1b[0m```');
            let gameResponse;
            try {
                gameResponse = await message.channel.awaitMessages({
                    filter,
                    max: 1,
                    time: timeout,
                    errors: ['time']
                });
            } catch (error) {
                return message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired. Please start over.\n[Ready for input]█\x1b[0m```');
            }
            const gameName = gameResponse.first().content.trim();

            // Step 2: Fetch existing arcade scores and validate game name
            const arcadeScores = await database.getHighScores();
            if (!arcadeScores.games[gameName]) {
                const availableGames = Object.keys(arcadeScores.games)
                    .map((name, index) => `${index + 1}. ${name}`)
                    .join('\n');
                return message.channel.send(
                    `Game "${gameName}" not found. Available games are:\n\`\`\`\n${availableGames}\n\`\`\``
                );
            }

            // Step 3: Ask for the new rules
            await message.channel.send('```ansi\n\x1b[32mEnter the new rules for the game:\x1b[0m```');
            let rulesResponse;
            try {
                rulesResponse = await message.channel.awaitMessages({
                    filter,
                    max: 1,
                    time: timeout,
                    errors: ['time']
                });
            } catch (error) {
                return message.channel.send('```ansi\n\x1b[32m[ERROR] Time expired. Please start over.\n[Ready for input]█\x1b[0m```');
            }
            const updatedRules = rulesResponse.first().content.trim();

            // Step 4: Update the rules in the database
            arcadeScores.games[gameName].description = updatedRules;
            await database.saveHighScores(arcadeScores);

            // Step 5: Send confirmation
            message.channel.send(`Rules for "${gameName}" updated successfully to:\n\`\`\`\n${updatedRules}\n\`\`\``);
        } catch (error) {
            console.error('Error updating game rules:', error);
            message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to update game rules. Please try again.\n[Ready for input]█\x1b[0m```');
        }
    }
};

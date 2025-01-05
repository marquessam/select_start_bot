module.exports = {
    name: 'updategamerules',
    description: 'Update game rules in the arcade challenge.',
    async execute(message, args) {
        // Check for admin permissions
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.channel.send('You do not have permission to use this command.');
        }

        // Parse arguments
        const [gameName, ...newRules] = args;
        if (!gameName || !newRules.length) {
            return message.channel.send('Usage: !updategamerules <game name> <new rules>');
        }

        const updatedRules = newRules.join(' ');

        try {
            // Fetch existing arcade scores
            const arcadeScores = await database.getHighScores();

            // Validate game name
            if (!arcadeScores.games[gameName]) {
                return message.channel.send(`Game "${gameName}" not found in the arcade challenge.`);
            }

            // Update the description for the game
            arcadeScores.games[gameName].description = updatedRules;

            // Save changes to the database
            await database.saveHighScores(arcadeScores);

            // Send confirmation message
            message.channel.send(`Rules for "${gameName}" updated successfully.`);
        } catch (error) {
            console.error('Error updating game rules:', error);
            message.channel.send('An error occurred while updating the game rules.');
        }
    }
};

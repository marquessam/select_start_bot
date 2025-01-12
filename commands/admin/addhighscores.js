// addhighscores.js
module.exports = {
    name: 'addhighscores',
    category: 'admin',
    description: 'Add high scores to the arcade leaderboard',
    permissions: ['ADMINISTRATOR'],
    
    async execute(message, args, client, database) {
        try {
            // Validate input data before processing
            if (!args || args.length < 3) {
                return message.reply('❌ Invalid arguments. Usage: !addhighscores <username> <gameId> <score>');
            }

            const [username, gameId, score] = args;
            
            // Validate each parameter
            if (!username) {
                return message.reply('❌ Username is required');
            }

            if (!gameId || isNaN(gameId)) {
                return message.reply('❌ Valid game ID is required');
            }

            if (!score || isNaN(score)) {
                return message.reply('❌ Valid score number is required');
            }

            // Create score data object with all required fields
            const scoreData = {
                username: username,
                gameId: parseInt(gameId),
                score: parseInt(score),
                timestamp: new Date(),
                verified: true // Admin-added scores are verified by default
            };

            // Save to database with validated data
            await database.saveArcadeScore(scoreData);
            
            return message.reply(`✅ Successfully added high score for ${username}`);
        } catch (error) {
            console.error('[AddHighScores] Error:', error);
            return message.reply('❌ An error occurred while adding the high score. Please check the logs.');
        }
    }
};

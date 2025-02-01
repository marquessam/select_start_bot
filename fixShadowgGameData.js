const database = require('./database'); // Adjust the path to your database module

async function fixShadowGameData() {
    try {
        // Fetch the current shadow game data
        const shadowGame = await database.getShadowGame();
        if (!shadowGame || !shadowGame.triforceState) {
            console.log('No shadow game data found or invalid structure');
            return;
        }

        // Fix wisdom.collected
        if (shadowGame.triforceState.wisdom.collected && !Array.isArray(shadowGame.triforceState.wisdom.collected)) {
            console.log('Fixing wisdom.collected:', shadowGame.triforceState.wisdom.collected);
            shadowGame.triforceState.wisdom.collected = [];
        }

        // Fix courage.collected
        if (shadowGame.triforceState.courage.collected && !Array.isArray(shadowGame.triforceState.courage.collected)) {
            console.log('Fixing courage.collected:', shadowGame.triforceState.courage.collected);
            shadowGame.triforceState.courage.collected = [];
        }

        // Save the updated data back to the database
        await database.saveShadowGame(shadowGame);
        console.log('Shadow game data fixed successfully');
    } catch (error) {
        console.error('Error fixing shadow game data:', error);
    }
}

// Run the fix script
fixShadowGameData();

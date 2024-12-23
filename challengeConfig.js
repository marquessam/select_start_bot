const fs = require('fs').promises;
const path = require('path');

async function getCurrentChallenge() {
    try {
        const configPath = path.join(__dirname, 'challenge.json');
        const configData = await fs.readFile(configPath, 'utf8');
        return JSON.parse(configData).currentChallenge;
    } catch (error) {
        console.error('Error reading challenge configuration:', error);
        throw error;
    }
}

module.exports = {
    getCurrentChallenge
};

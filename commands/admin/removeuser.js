const database = require('./database');

async function removeUser(username) {
    try {
        // Fetch user stats
        const userStats = await database.getUserStats(username);

        if (!userStats) {
            console.log(`User "${username}" not found in the database.`);
            return;
        }

        // Remove user from the database
        await database.removeUser(username);

        console.log(`User "${username}" has been successfully removed.`);
    } catch (error) {
        console.error(`Error removing user "${username}":`, error);
    }
}

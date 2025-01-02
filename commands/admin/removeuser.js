const database = require('./database');

async function removeUserCommand(username) {
    try {
        if (!username) {
            console.log('Username is required to remove a user.');
            return;
        }

        const success = await database.removeUser(username);

        if (success) {
            console.log(`User "${username}" has been successfully removed.`);
        } else {
            console.log(`User "${username}" does not exist in the database.`);
        }
    } catch (error) {
        console.error(`Error removing user "${username}":`, error);
    }
}

module.exports = { removeUserCommand };

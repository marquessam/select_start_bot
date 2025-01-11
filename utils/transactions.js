// utils/transactions.js
const ErrorHandler = require('./errorHandler');

async function withTransaction(database, operation) {
    const session = database.client.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await operation(session);
        });
        return result;
    } catch (error) {
        ErrorHandler.logError(error, 'Database Transaction');
        throw error;
    } finally {
        await session.endSession();
    }
}

module.exports = { withTransaction };

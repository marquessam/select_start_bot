const ErrorHandler = require('./errorHandler');

async function fetchData(collection, filter = {}, defaultData = {}) {
    try {
        const data = await collection.findOne(filter);
        return data || defaultData;
    } catch (error) {
        ErrorHandler.logError(error, `Fetching Data: ${collection.collectionName}`);
        throw error;
    }
}

module.exports = { fetchData };

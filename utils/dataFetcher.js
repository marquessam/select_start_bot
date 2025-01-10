import ErrorHandler from './errorHandler.js';

export async function fetchData(collection, filter = {}, defaultData = {}) {
    try {
        const data = await collection.findOne(filter);
        return data || defaultData;
    } catch (error) {
        ErrorHandler.logError(error, `Fetching Data: ${collection.collectionName}`);
        throw error;
    }
}

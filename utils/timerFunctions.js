// utils/timerFunctions.js

// Gets the last day of the current month
function getLastDayOfMonth() {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// Gets time until end of month
function getTimeUntilMonthEnd() {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return endOfMonth - now;
}

// Formats milliseconds into readable time
function formatTimeRemaining(ms) {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${days}d ${hours}h ${minutes}m`;
}

// Gets the end of month timestamp
function getMonthEndTimestamp() {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    // Convert to Unix time
    return Math.floor(endOfMonth / 1000);
}

module.exports = {
    getLastDayOfMonth,
    getTimeUntilMonthEnd,
    formatTimeRemaining,
    getMonthEndTimestamp
};

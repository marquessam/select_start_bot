// utils/timerFunctions.js

/**
 * Discord Timestamp Formats:
 * t: Short Time (e.g., 8:00 PM)
 * T: Long Time (e.g., 8:00:00 PM)
 * d: Short Date (e.g., 06/21/2024)
 * D: Long Date (e.g., June 21, 2024)
 * f: Short Date/Time (e.g., June 21, 2024 8:00 PM)
 * F: Long Date/Time (e.g., Friday, June 21, 2024 8:00 PM)
 * R: Relative Time (e.g., in 3 hours)
 */

// Gets the last day of current month
function getLastDayOfMonth() {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

// Gets time until end of month with Discord timestamp
function getTimeUntilMonthEnd() {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return lastDay - now;
}

// Creates a Discord timestamp string
function createTimestamp(date, format = 'f') {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }
    return `<t:${Math.floor(date.getTime() / 1000)}:${format}>`;
}

// Format challenge dates with Discord timestamps
function formatChallengeDates(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    return {
        startDisplay: createTimestamp(start, 'D'),
        endDisplay: createTimestamp(end, 'D'),
        startFull: createTimestamp(start, 'F'),
        endFull: createTimestamp(end, 'F'),
        startRelative: createTimestamp(start, 'R'),
        endRelative: createTimestamp(end, 'R')
    };
}

// Format event times with Discord timestamps
function formatEventTime(eventTime) {
    if (!(eventTime instanceof Date)) {
        eventTime = new Date(eventTime);
    }
    
    return {
        time: createTimestamp(eventTime, 't'),
        fullDateTime: createTimestamp(eventTime, 'F'),
        relative: createTimestamp(eventTime, 'R')
    };
}

// Format countdown for announcements
function formatCountdown(targetDate) {
    if (!(targetDate instanceof Date)) {
        targetDate = new Date(targetDate);
    }
    
    return createTimestamp(targetDate, 'R');
}

// Get formatted month range for challenge
function getMonthRange(year = null, month = null) {
    const now = new Date();
    year = year || now.getFullYear();
    month = month !== null ? month : now.getMonth();
    
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59);
    
    return {
        start: createTimestamp(start, 'D'),
        end: createTimestamp(end, 'D'),
        relative: {
            start: createTimestamp(start, 'R'),
            end: createTimestamp(end, 'R')
        },
        full: {
            start: createTimestamp(start, 'F'),
            end: createTimestamp(end, 'F')
        }
    };
}

// Example usage in announcement embed
function createTimeBasedEmbed(targetDate, title, description) {
    return new TerminalEmbed()
        .setTerminalTitle(title)
        .setTerminalDescription(description)
        .addTerminalField('TIME INFORMATION',
            `Event occurs: ${createTimestamp(targetDate, 'F')}\n` +
            `Local time: ${createTimestamp(targetDate, 't')}\n` +
            `Relative time: ${createTimestamp(targetDate, 'R')}`)
        .setTerminalFooter();
}

module.exports = {
    getLastDayOfMonth,
    getTimeUntilMonthEnd,
    createTimestamp,
    formatChallengeDates,
    formatEventTime,
    formatCountdown,
    getMonthRange,
    createTimeBasedEmbed
};

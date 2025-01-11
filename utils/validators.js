// utils/validators.js
const commonValidators = {
    username: (username) => {
        if (!username || typeof username !== 'string') return false;
        username = username.trim();
        return username.length >= 2 && username.length <= 30 && /^[a-zA-Z0-9_-]+$/.test(username);
    },
    
    points: (points) => {
        const num = parseInt(points);
        return !isNaN(num) && num >= -100 && num <= 100;
    },
    
    reason: (reason) => {
        if (!reason || typeof reason !== 'string') return false;
        reason = reason.trim();
        return reason.length >= 3 && reason.length <= 200;
    },

    score: (score) => {
        const num = parseInt(score);
        return !isNaN(num) && num >= 0 && num <= 99999999;
    },

    gameId: (id) => {
        return /^\d+$/.test(id) && id.length <= 10;
    }
};

module.exports = commonValidators;

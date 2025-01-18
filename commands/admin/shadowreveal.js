// commands/admin/shadowreveal.js

module.exports = {
    name: 'shadowreveal',
    description: 'Re-reveals the current shadow game reward',
    async execute(message, args, { shadowGame }) {
        try {
            // Load current config if not loaded
            if (!shadowGame.config) {
                await shadowGame.loadConfig();
            }

            // Check if there's an active shadow game
            if (!shadowGame.config?.active) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] No active shadow game found\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Trigger the reveal message
            await shadowGame.revealShadowChallenge(message);
            
        } catch (error) {
            console.error('Shadow Reveal Error:', error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Failed to reveal shadow game\n[Ready for input]█\x1b[0m```');
        }
    }
};

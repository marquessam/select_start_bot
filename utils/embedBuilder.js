const { EmbedBuilder } = require('discord.js');

class TerminalEmbed extends EmbedBuilder {
    constructor() {
        super();
        this.setColor('#00FF00');
    }

    setTerminalTitle(title) {
        return this.setTitle(title.toUpperCase());
    }

    setTerminalDescription(text) {
        return this.setDescription('```ansi\n\x1b[32m' + text + '\x1b[0m```');
    }

    addTerminalField(name, value) {
        return this.addFields({
            name: name.toUpperCase(),
            value: '```ansi\n\x1b[32m' + value + '\x1b[0m```'
        });
    }

    setTerminalFooter() {
        return this.setFooter({ 
            text: `TERMINAL_ID: ${Date.now().toString(36).toUpperCase()}` 
        });
    }

    // Override setImage to ensure it works with terminal styling
    setImage(url) {
        if (!url) return this;
        return super.setImage(url);
    }

    // Add a terminal-themed thumbnail if needed
    setTerminalThumbnail(url) {
        if (!url) return this;
        return super.setThumbnail(url);
    }
}

module.exports = TerminalEmbed;

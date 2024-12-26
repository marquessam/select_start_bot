const fs = require('fs');
const path = require('path');

class CommandHandler {
    constructor() {
        this.commands = new Map();
    }

    async loadCommands(dependencies) {
        const commandsPath = path.join(__dirname, '..', 'commands');
        
        // Load regular commands
        const commandFiles = fs.readdirSync(commandsPath)
            .filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            this.commands.set(command.name, command);
        }

        // Load admin commands
        const adminPath = path.join(commandsPath, 'admin');
        if (fs.existsSync(adminPath)) {
            const adminFiles = fs.readdirSync(adminPath)
                .filter(file => file.endsWith('.js'));

            for (const file of adminFiles) {
                const command = require(path.join(adminPath, file));
                this.commands.set(command.name, command);
            }
        }

        console.log(`Loaded ${this.commands.size} commands`);
    }

    async handleCommand(message, dependencies) {
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = this.commands.get(commandName);
        if (!command) return;

        try {
            await command.execute(message, args, dependencies);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Command execution failed\n[Ready for input]█\x1b[0m```');
        }
    }
}

module.exports = CommandHandler;

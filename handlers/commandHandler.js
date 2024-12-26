const fs = require('fs');
const path = require('path');

class CommandHandler {
    constructor() {
        this.commands = new Map();
    }

    async loadCommands(dependencies) {
        try {
            const commandsPath = path.join(__dirname, '..', 'commands');
            console.log('Loading commands from:', commandsPath);
            
            // Load regular commands
            const commandFiles = fs.readdirSync(commandsPath)
                .filter(file => file.endsWith('.js'));
            console.log('Found command files:', commandFiles);

            for (const file of commandFiles) {
                try {
                    const command = require(path.join(commandsPath, file));
                    console.log(`Loading command from ${file}:`, command.name);
                    this.commands.set(command.name, command);
                } catch (error) {
                    console.error(`Error loading command ${file}:`, error);
                }
            }

            // Load admin commands
            const adminPath = path.join(commandsPath, 'admin');
            if (fs.existsSync(adminPath)) {
                console.log('Loading admin commands from:', adminPath);
                const adminFiles = fs.readdirSync(adminPath)
                    .filter(file => file.endsWith('.js'));
                console.log('Found admin command files:', adminFiles);

                for (const file of adminFiles) {
                    try {
                        const command = require(path.join(adminPath, file));
                        console.log(`Loading admin command from ${file}:`, command.name);
                        this.commands.set(command.name, command);
                    } catch (error) {
                        console.error(`Error loading admin command ${file}:`, error);
                    }
                }
            }

            console.log('Loaded commands:', Array.from(this.commands.keys()));
            console.log(`Total commands loaded: ${this.commands.size}`);
        } catch (error) {
            console.error('Error in loadCommands:', error);
        }
    }

    async handleCommand(message, dependencies) {
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        console.log('Attempting to handle command:', commandName);
        console.log('Available commands:', Array.from(this.commands.keys()));

        const command = this.commands.get(commandName);
        if (!command) {
            console.log('Command not found:', commandName);
            return;
        }

        try {
            console.log(`Executing command ${commandName} with args:`, args);
            await command.execute(message, args, dependencies);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Command execution failed\n[Ready for input]█\x1b[0m```');
        }
    }
}

module.exports = CommandHandler;

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
                    const filePath = path.join(commandsPath, file);
                    console.log('Loading file:', filePath);
                    const command = require(filePath);
                    console.log('Loaded command:', command.name);
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
                console.log('Found admin files:', adminFiles);

                for (const file of adminFiles) {
                    try {
                        const filePath = path.join(adminPath, file);
                        console.log('Loading admin file:', filePath);
                        const command = require(filePath);
                        console.log('Loaded admin command:', command.name);
                        this.commands.set(command.name, command);
                    } catch (error) {
                        console.error(`Error loading admin command ${file}:`, error);
                    }
                }
            }

            console.log('All loaded commands:', Array.from(this.commands.keys()));
        } catch (error) {
            console.error('Error in loadCommands:', error);
        }
    }

    async handleCommand(message, dependencies) {
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        console.log('Received command:', commandName);
        console.log('Available commands:', Array.from(this.commands.keys()));

        const command = this.commands.get(commandName);
        if (!command) {
            console.log('Command not found:', commandName);
            return;
        }

        try {
            console.log('Executing command:', commandName);
            await command.execute(message, args, dependencies);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Command execution failed\n[Ready for input]█\x1b[0m```');
        }
    }
}

module.exports = CommandHandler;

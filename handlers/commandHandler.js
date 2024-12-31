const fs = require('fs');
const path = require('path');

class CommandHandler {
    constructor() {
        this.commands = new Map();
    }

    async loadCommands(dependencies) {
        try {
            console.log('Starting command loading process...');
            
            // Debug current directory
            console.log('Current directory:', __dirname);
            console.log('Parent directory:', path.join(__dirname, '..'));
            console.log('Root directory files:', fs.readdirSync(path.join(__dirname, '..')));
            
            // Load regular commands from root/commands
            const commandsPath = path.join(__dirname, '..', 'commands');
            console.log('Attempting to load commands from:', commandsPath);
            
            if (!fs.existsSync(commandsPath)) {
                console.error('Commands directory does not exist at:', commandsPath);
                return;
            }

            // Check contents of commands directory
            const commandDirContents = fs.readdirSync(commandsPath);
            console.log('Commands directory contents:', commandDirContents);

            const commandFiles = commandDirContents.filter(file => file.endsWith('.js'));
            console.log('Found command files:', commandFiles);

            for (const file of commandFiles) {
                try {
                    const filePath = path.join(commandsPath, file);
                    console.log('Loading command file:', filePath);
                    
                    // Attempt to load the command
                    const command = require(filePath);
                    console.log('Command module loaded:', command);
                    
                    if (command.name) {
                        console.log('Adding command:', command.name);
                        this.commands.set(command.name, command);
                    } else {
                        console.warn('Command file missing name property:', file);
                    }
                } catch (error) {
                    console.error(`Error loading command ${file}:`, error);
                }
            }

            // Load admin commands
            const adminPath = path.join(commandsPath, 'admin');
            console.log('Checking for admin directory:', adminPath);
            
            if (fs.existsSync(adminPath)) {
                console.log('Admin directory exists, checking contents');
                const adminFiles = fs.readdirSync(adminPath)
                    .filter(file => file.endsWith('.js'));
                console.log('Found admin files:', adminFiles);

                for (const file of adminFiles) {
                    try {
                        const filePath = path.join(adminPath, file);
                        console.log('Loading admin file:', filePath);
                        
                        const command = require(filePath);
                        console.log('Admin command module loaded:', command);
                        
                        if (command.name) {
                            console.log('Adding admin command:', command.name);
                            this.commands.set(command.name, command);
                        } else {
                            console.warn('Admin command file missing name property:', file);
                        }
                    } catch (error) {
                        console.error(`Error loading admin command ${file}:`, error);
                    }
                }
            } else {
                console.warn('Admin directory not found at:', adminPath);
            }

            console.log('Command loading complete. Available commands:', Array.from(this.commands.keys()));
        } catch (error) {
            console.error('Error in loadCommands:', error);
            throw error;
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

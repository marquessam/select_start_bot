const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

class CommandHandler {
    constructor() {
        this.commands = new Collection();
    }

    async loadCommands(dependencies) {
        try {
            // Load regular commands from root/commands
            const commandsPath = path.join(__dirname, '..', 'commands');
            
            if (!fs.existsSync(commandsPath)) {
                console.error('Commands directory does not exist at:', commandsPath);
                return;
            }

            // Load regular commands
            const commandFiles = fs.readdirSync(commandsPath)
                .filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                try {
                    const filePath = path.join(commandsPath, file);
                    const command = require(filePath);
                    
                    if (command.name) {
                        this.commands.set(command.name, command);
                    }
                } catch (error) {
                    console.error(`Error loading command ${file}:`, error);
                }
            }

            // Load admin commands
            const adminPath = path.join(commandsPath, 'admin');
            if (fs.existsSync(adminPath)) {
                const adminFiles = fs.readdirSync(adminPath)
                    .filter(file => file.endsWith('.js'));

                for (const file of adminFiles) {
                    try {
                        const filePath = path.join(adminPath, file);
                        const command = require(filePath);
                        
                        if (command.name) {
                            command.isAdmin = true; // Mark as admin command
                            this.commands.set(command.name, command);
                        }
                    } catch (error) {
                        console.error(`Error loading admin command ${file}:`, error);
                    }
                }
            }

            console.log('Commands loaded:', Array.from(this.commands.keys()));
        } catch (error) {
            console.error('Error in loadCommands:', error);
            throw error;
        }
    }

    async handleCommand(message, dependencies) {
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        const command = this.commands.get(commandName);
        if (!command) return;

        // Check if it's an admin command and the user has admin permissions
        if (command.isAdmin && !this.hasAdminPermission(message)) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
            return;
        }

        try {
            await command.execute(message, args, dependencies);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Command execution failed\n[Ready for input]█\x1b[0m```');
        }
    }

    hasAdminPermission(message) {
        // Check if user has admin role or is a server admin
        return message.member && (
            message.member.permissions.has('ADMINISTRATOR') ||
            message.member.roles.cache.some(role => 
                role.id === process.env.ADMIN_ROLE_ID
            )
        );
    }
}

module.exports = CommandHandler;

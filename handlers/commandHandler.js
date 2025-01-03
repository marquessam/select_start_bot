const fs = require('fs');
const path = require('path');
const { Collection, PermissionFlagsBits } = require('discord.js');

class CommandHandler {
    constructor() {
        this.commands = new Collection();
    }

    async loadCommands(dependencies) {
        try {
            const commandsPath = path.join(__dirname, '..', 'commands');
            
            if (!fs.existsSync(commandsPath)) {
                console.error('Commands directory does not exist at:', commandsPath);
                return;
            }

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

            const adminPath = path.join(commandsPath, 'admin');
            if (fs.existsSync(adminPath)) {
                const adminFiles = fs.readdirSync(adminPath)
                    .filter(file => file.endsWith('.js'));

                for (const file of adminFiles) {
                    try {
                        const filePath = path.join(adminPath, file);
                        const command = require(filePath);
                        
                        if (command.name) {
                            command.isAdmin = true;
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

    async handleCommand(message, { shadowGame, userStats, announcer, leaderboardCache }) {
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        const command = this.commands.get(commandName);
        if (!command) return;

        if (command.isAdmin && !this.hasAdminPermission(message)) {
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
            return;
        }

        try {
            await command.execute(message, args, { shadowGame, userStats, announcer, leaderboardCache });
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Command execution failed\n[Ready for input]█\x1b[0m```');
        }
    }

    hasAdminPermission(message) {
        return message.member && (
            message.member.permissions.has(PermissionFlagsBits.Administrator) ||
            message.member.roles.cache.some(role => 
                role.id === process.env.ADMIN_ROLE_ID
            )
        );
    }
}

module.exports = CommandHandler;

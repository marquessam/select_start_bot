const fs = require('fs');
const path = require('path');
const { Collection, PermissionFlagsBits } = require('discord.js');
const ErrorHandler = require('../utils/errorHandler');

class CommandHandler {
    constructor() {
        this.commands = new Collection();
        this.adminCommands = new Collection();
        this.cooldowns = new Map();
        this.config = {
            defaultCooldown: 3000,  // 3 seconds
            adminCooldown: 1000,    // 1 second
            commandsPath: path.join(__dirname, '..', 'commands'),
            adminCommandsPath: path.join(__dirname, '..', 'commands', 'admin')
        };
    }

    async loadCommands(dependencies) {
        try {
            // Clear existing commands
            this.commands.clear();
            this.adminCommands.clear();

            // Load regular commands
            await this._loadCommandsFromDirectory(
                this.config.commandsPath, 
                this.commands,
                false
            );

            // Load admin commands
            if (fs.existsSync(this.config.adminCommandsPath)) {
                await this._loadCommandsFromDirectory(
                    this.config.adminCommandsPath,
                    this.adminCommands,
                    true
                );
            }

            // Inject dependencies into all commands
            this._injectDependencies(dependencies);

            console.log(`Loaded ${this.commands.size} regular commands and ${this.adminCommands.size} admin commands`);
            return true;
        } catch (error) {
            ErrorHandler.logError(error, 'Command Loading');
            return false;
        }
    }

    async _loadCommandsFromDirectory(directoryPath, collection, isAdmin = false) {
        const commandFiles = fs.readdirSync(directoryPath)
            .filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            try {
                const filePath = path.join(directoryPath, file);
                delete require.cache[require.resolve(filePath)]; // Clear cache
                const command = require(filePath);
                
                if (command.name) {
                    command.isAdmin = isAdmin;
                    collection.set(command.name, command);
                }
            } catch (error) {
                ErrorHandler.logError(error, `Loading command ${file}`);
            }
        }
    }

    _injectDependencies(dependencies) {
        // Inject dependencies into regular commands
        for (const [name, command] of this.commands) {
            command.dependencies = dependencies;
        }

        // Inject dependencies into admin commands
        for (const [name, command] of this.adminCommands) {
            command.dependencies = dependencies;
        }
    }

    hasAdminPermission(message) {
        return message.member && (
            message.member.permissions.has(PermissionFlagsBits.Administrator) ||
            message.member.roles.cache.has(process.env.ADMIN_ROLE_ID)
        );
    }

    isOnCooldown(userId, commandName) {
        const now = Date.now();
        const cooldownKey = `${userId}-${commandName}`;
        const cooldownTime = this.cooldowns.get(cooldownKey);

        if (cooldownTime && now < cooldownTime) {
            return true;
        }

        // Set new cooldown
        const command = this.commands.get(commandName) || this.adminCommands.get(commandName);
        const cooldownDuration = command?.isAdmin ? 
            this.config.adminCooldown : 
            this.config.defaultCooldown;

        this.cooldowns.set(cooldownKey, now + cooldownDuration);
        
        // Clean up expired cooldowns periodically
        if (Math.random() < 0.1) { // 10% chance to clean up on each command
            this._cleanupCooldowns();
        }

        return false;
    }

    _cleanupCooldowns() {
        const now = Date.now();
        for (const [key, time] of this.cooldowns) {
            if (now >= time) {
                this.cooldowns.delete(key);
            }
        }
    }

    async handleCommand(message, services) {
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).split(/ +/);
        const commandName = args.shift().toLowerCase();
        
        // Check regular commands first
        let command = this.commands.get(commandName);
        let isAdminCommand = false;

        // If not found in regular commands, check admin commands
        if (!command) {
            command = this.adminCommands.get(commandName);
            isAdminCommand = true;
        }

        if (!command) return;

        try {
            // Check permissions for admin commands
            if (isAdminCommand && !this.hasAdminPermission(message)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Check cooldown
            if (this.isOnCooldown(message.author.id, commandName)) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Command on cooldown\n[Ready for input]█\x1b[0m```');
                return;
            }

            // Execute command
            await command.execute(message, args, services);
        } catch (error) {
            ErrorHandler.logError(error, `Command Execution: ${commandName}`);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] Command execution failed\n[Ready for input]█\x1b[0m```');
        }
    }

    // Utility method for command reloading
    async reloadCommand(commandName) {
        try {
            // Check regular commands
            const regularPath = path.join(this.config.commandsPath, `${commandName}.js`);
            const adminPath = path.join(this.config.adminCommandsPath, `${commandName}.js`);

            if (fs.existsSync(regularPath)) {
                delete require.cache[require.resolve(regularPath)];
                const command = require(regularPath);
                this.commands.set(commandName, command);
                return true;
            }

            if (fs.existsSync(adminPath)) {
                delete require.cache[require.resolve(adminPath)];
                const command = require(adminPath);
                command.isAdmin = true;
                this.adminCommands.set(commandName, command);
                return true;
            }

            return false;
        } catch (error) {
            ErrorHandler.logError(error, `Reloading command: ${commandName}`);
            return false;
        }
    }
}

module.exports = CommandHandler;

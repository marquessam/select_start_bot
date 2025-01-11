// handlers/commandHandler.js
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const logger = require('../utils/logger');

class CommandHandler {
    constructor() {
        this.commands = new Collection();
        this.adminCommands = new Collection();
        this.cooldowns = new Map();

        this.config = {
            defaultCooldown: 3000,   // 3 seconds for normal commands
            adminCooldown: 1000,     // 1 second for admin commands
            commandsPath: path.join(__dirname, '..', 'commands'),
            adminCommandsPath: path.join(__dirname, '..', 'commands', 'admin')
        };
    }

    async loadCommands(dependencies) {
        try {
            // Clear existing commands in both collections
            this.commands.clear();
            this.adminCommands.clear();

            // Load normal commands
            await this._loadCommandsFromDirectory(
                this.config.commandsPath,
                this.commands,
                false // isAdmin
            );

            // Load admin commands (if directory exists)
            if (fs.existsSync(this.config.adminCommandsPath)) {
                await this._loadCommandsFromDirectory(
                    this.config.adminCommandsPath,
                    this.adminCommands,
                    true // isAdmin
                );
            }

            // Inject dependencies
            this._injectDependencies(dependencies);

            logger.info(`CommandHandler: Loaded ${this.commands.size} normal commands and ${this.adminCommands.size} admin commands.`);
            return true;
        } catch (error) {
            logger.error('Error loading commands:', { error: error.message });
            return false;
        }
    }

    async _loadCommandsFromDirectory(dirPath, collection, isAdmin = false) {
        const commandFiles = fs
            .readdirSync(dirPath)
            .filter((file) => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(dirPath, file);
            try {
                // Clear the require cache so reloading is possible
                delete require.cache[require.resolve(filePath)];

                const command = require(filePath);
                if (command.name) {
                    // Convert command name to lowercase for consistency
                    const cmdName = command.name.toLowerCase();

                    // Mark if it's an admin command
                    command.isAdmin = isAdmin;

                    // Store in the appropriate collection
                    collection.set(cmdName, command);
                }
            } catch (err) {
                logger.error(`Error loading command file: ${file}`, { error: err.message });
            }
        }
    }

    _injectDependencies(dependencies) {
        for (const command of this.commands.values()) {
            command.dependencies = dependencies;
        }
        for (const command of this.adminCommands.values()) {
            command.dependencies = dependencies;
        }
    }

    hasAdminPermission(message) {
        const member = message.member;
        if (!member) return false;

        return (
            member.permissions.has('ADMINISTRATOR') ||
            member.roles.cache.has(process.env.ADMIN_ROLE_ID)
        );
    }

    isOnCooldown(userId, commandName, isAdmin) {
        const now = Date.now();
        const cooldownKey = `${userId}-${commandName}`;

        const cooldownEnd = this.cooldowns.get(cooldownKey);
        if (cooldownEnd && now < cooldownEnd) {
            return true;
        }

        // Determine the cooldown duration
        const duration = isAdmin
            ? this.config.adminCooldown
            : this.config.defaultCooldown;

        // Set the new cooldown expiration time
        this.cooldowns.set(cooldownKey, now + duration);

        // Occasionally clean up old cooldowns
        if (Math.random() < 0.1) {
            this._cleanupCooldowns();
        }

        return false;
    }

    _cleanupCooldowns() {
        const now = Date.now();
        for (const [key, expireTime] of this.cooldowns.entries()) {
            if (now >= expireTime) {
                this.cooldowns.delete(key);
            }
        }
    }

    async handleCommand(message, services) {
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        // Check normal commands first
        let command = this.commands.get(commandName);
        let isAdminCommand = false;

        // If not found, check admin
        if (!command) {
            command = this.adminCommands.get(commandName);
            isAdminCommand = !!command;
        }

        // If no command found at all, bail
        if (!command) return;

        try {
            // If it's admin, verify user has permission
            if (isAdminCommand && !this.hasAdminPermission(message)) {
                await message.channel.send(
                    '```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```'
                );
                return;
            }

            // Check cooldown
            if (this.isOnCooldown(
                message.author.id,
                commandName,
                isAdminCommand
            )) {
                await message.channel.send(
                    '```ansi\n\x1b[32m[ERROR] Command on cooldown\n[Ready for input]█\x1b[0m```'
                );
                return;
            }

            // Execute the command
            await command.execute(message, args, services);
            
            // Log successful command execution
            logger.info('Command executed', {
                command: commandName,
                user: message.author.username,
                guild: message.guild?.name || 'DM',
                channel: message.channel.name
            });

        } catch (error) {
            logger.error('Command execution failed', {
                command: commandName,
                user: message.author.username,
                error: error.message
            });
            
            await message.channel.send(
                '```ansi\n\x1b[32m[ERROR] Command execution failed\n[Ready for input]█\x1b[0m```'
            );
        }
    }

    async reloadCommand(commandName) {
        try {
            const nameLower = commandName.toLowerCase();

            // Remove from normal or admin collections if exists
            this.commands.delete(nameLower);
            this.adminCommands.delete(nameLower);

            // Attempt reload from normal commands
            const regularPath = path.join(this.config.commandsPath, `${nameLower}.js`);
            if (fs.existsSync(regularPath)) {
                delete require.cache[require.resolve(regularPath)];
                const cmd = require(regularPath);
                cmd.isAdmin = false;
                this.commands.set(nameLower, cmd);
                return true;
            }

            // Attempt reload from admin commands
            const adminPath = path.join(this.config.adminCommandsPath, `${nameLower}.js`);
            if (fs.existsSync(adminPath)) {
                delete require.cache[require.resolve(adminPath)];
                const cmd = require(adminPath);
                cmd.isAdmin = true;
                this.adminCommands.set(nameLower, cmd);
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Error reloading command:', {
                command: commandName,
                error: error.message
            });
            return false;
        }
    }
}

module.exports = CommandHandler;

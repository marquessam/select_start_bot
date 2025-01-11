const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { ErrorHandler, BotError } = require('../utils/errorHandler');
const PermissionsManager = require('../utils/permissions');
const commonValidators = require('../utils/validators');

class CommandHandler {
    constructor() {
        this.commands = new Collection();
        this.adminCommands = new Collection();
        this.cooldowns = new Map();

        this.config = {
            defaultCooldown: 3000,
            adminCooldown: 1000,
            maxRetries: 3,
            retryDelay: 1000,
            commandsPath: path.join(__dirname, '..', 'commands'),
            adminCommandsPath: path.join(__dirname, '..', 'commands', 'admin')
        };
    }

    async loadCommands(dependencies) {
        try {
            this.commands.clear();
            this.adminCommands.clear();

            // Load normal commands
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

            this._injectDependencies(dependencies);

            console.log(
                `CommandHandler: Loaded ${this.commands.size} normal commands and ` +
                `${this.adminCommands.size} admin commands.`
            );
            return true;
        } catch (error) {
            ErrorHandler.logError(error, 'Command Loading');
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
                delete require.cache[require.resolve(filePath)];
                const command = require(filePath);

                if (command.name) {
                    const cmdName = command.name.toLowerCase();
                    command.isAdmin = isAdmin;
                    collection.set(cmdName, command);
                }
            } catch (err) {
                ErrorHandler.logError(err, `Loading command file: ${file}`);
            }
        }
    }

    _injectDependencies(dependencies) {
        for (const collection of [this.commands, this.adminCommands]) {
            for (const command of collection.values()) {
                command.dependencies = dependencies;
            }
        }
    }

    async validateAndGetCommand(message, commandName) {
        // Check normal commands first
        let command = this.commands.get(commandName);
        let isAdminCommand = false;

        // If not found, check admin commands
        if (!command) {
            command = this.adminCommands.get(commandName);
            isAdminCommand = !!command;
        }

        if (!command) {
            return null;
        }

        // Validate permissions
        try {
            await PermissionsManager.validateCommand(message, command);
        } catch (error) {
            throw error;
        }

        return { command, isAdminCommand };
    }

    isOnCooldown(userId, commandName, isAdmin) {
        const now = Date.now();
        const cooldownKey = `${userId}-${commandName}`;
        const cooldownEnd = this.cooldowns.get(cooldownKey);

        if (cooldownEnd && now < cooldownEnd) {
            return true;
        }

        const duration = isAdmin ? 
            this.config.adminCooldown : 
            this.config.defaultCooldown;

        this.cooldowns.set(cooldownKey, now + duration);

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
    const startTime = Date.now();

    try {
        const commandInfo = await this.validateAndGetCommand(message, commandName);
        
        if (!commandInfo) {
            logger.debug('Command not found', {
                command: commandName,
                user: message.author.username
            });
            return;
        }

        const { command, isAdminCommand } = commandInfo;

        // Check cooldown
        if (this.isOnCooldown(message.author.id, commandName, isAdminCommand)) {
            throw new BotError(
                'Command is on cooldown',
                ErrorHandler.ERROR_TYPES.RATE_LIMIT,
                'Command Execution'
            );
        }

        // Execute with retry logic
        let lastError = null;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                await command.execute(message, args, services);
                
                // Log successful command execution
                await actionLogger.logCommand(message, command, true);
                
                logger.info('Command executed successfully', {
                    command: commandName,
                    user: message.author.username,
                    duration: Date.now() - startTime
                });
                
                return;
            } catch (error) {
                lastError = error;
                
                logger.warn(`Command failed (attempt ${attempt}/${this.config.maxRetries})`, {
                    command: commandName,
                    user: message.author.username,
                    error: error.message
                });

                if (attempt < this.config.maxRetries) {
                    await new Promise(resolve => 
                        setTimeout(resolve, this.config.retryDelay * attempt)
                    );
                }
            }
        }

        // If we get here, all retries failed
        throw lastError;

    } catch (error) {
        // Log failed command
        await actionLogger.logCommand(message, command, false, error);
        
        logger.error('Command failed', {
            command: commandName,
            user: message.author.username,
            error: error.message,
            duration: Date.now() - startTime
        });

        // Handle different types of errors appropriately
        if (error instanceof BotError) {
            if (error.type === ErrorHandler.ERROR_TYPES.PERMISSION) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```');
            } else if (error.type === ErrorHandler.ERROR_TYPES.RATE_LIMIT) {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Command on cooldown\n[Ready for input]█\x1b[0m```');
            } else {
                await message.channel.send('```ansi\n\x1b[32m[ERROR] Command execution failed\n[Ready for input]█\x1b[0m```');
            }
        } else {
            ErrorHandler.logError(error, `Command Execution: ${commandName}`);
            await message.channel.send('```ansi\n\x1b[32m[ERROR] An unexpected error occurred\n[Ready for input]█\x1b[0m```');
        }
    }
}
    
    async reloadCommand(commandName) {
        try {
            const nameLower = commandName.toLowerCase();
            
            // Remove from existing collections
            this.commands.delete(nameLower);
            this.adminCommands.delete(nameLower);

            // Try loading from regular commands
            const regularPath = path.join(this.config.commandsPath, `${nameLower}.js`);
            if (fs.existsSync(regularPath)) {
                delete require.cache[require.resolve(regularPath)];
                const cmd = require(regularPath);
                cmd.isAdmin = false;
                this.commands.set(nameLower, cmd);
                return true;
            }

            // Try loading from admin commands
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
            ErrorHandler.logError(error, `Reloading command: ${commandName}`);
            return false;
        }
    }
}

module.exports = CommandHandler;

const fs = require('fs');
const path = require('path');
const { Collection, PermissionFlagsBits } = require('discord.js');
const ErrorHandler = require('../utils/errorHandler');

const DM_ALLOWED_COMMANDS = new Set([
    'profile',    
    'leaderboard', 
    'search',     
    'help',       
    'challenge',
    'nominations',
    'review'
]);

class CommandHandler {
    constructor() {
        // Separate collections for normal and admin commands
        this.commands = new Collection();
        this.adminCommands = new Collection();

        // Cooldown map: key = `${userId}-${commandName}`, value = timestamp when cooldown ends
        this.cooldowns = new Map();

        // Configuration
        this.config = {
            defaultCooldown: 3000,   // 3 seconds for normal commands
            adminCooldown: 1000,     // 1 second for admin commands
            commandsPath: path.join(__dirname, '..', 'commands'),
            adminCommandsPath: path.join(__dirname, '..', 'commands', 'admin')
        };
    }

    /**
     * Load both normal and admin commands, then inject dependencies.
     */
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

    /**
     * Loads .js files from a directory into either the normal commands
     * collection or the admin commands collection.
     */
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
                ErrorHandler.logError(err, `Loading command file: ${file}`);
            }
        }
    }

    /**
     * Inject shared dependencies into all commands (both normal & admin).
     */
    _injectDependencies(dependencies) {
        for (const command of this.commands.values()) {
            command.dependencies = dependencies;
        }
        for (const command of this.adminCommands.values()) {
            command.dependencies = dependencies;
        }
    }

    /**
     * Check if the message author has admin permission via either
     * the Administrator bit or a special ADMIN_ROLE_ID.
     */
   hasAdminPermission(message) {
    // In DMs, check against a list of admin user IDs
    if (!message.guild) {
        const adminUsers = process.env.ADMIN_USER_IDS?.split(',') || [];
        return adminUsers.includes(message.author.id);
    }

    // In server, check roles as before
    const member = message.member;
    if (!member) return false;

    return (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.roles.cache.has(process.env.ADMIN_ROLE_ID)
    );
}

    /**
     * Checks if the user is on cooldown for a given command.
     * If not, sets a new cooldown.
     */
    isOnCooldown(userId, commandName, isAdmin) {
        const now = Date.now();
        const cooldownKey = `${userId}-${commandName}`;

        const cooldownEnd = this.cooldowns.get(cooldownKey);
        if (cooldownEnd && now < cooldownEnd) {
            // Still on cooldown
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

    /**
     * Cleanup expired entries in the cooldown map.
     */
    _cleanupCooldowns() {
        const now = Date.now();
        for (const [key, expireTime] of this.cooldowns.entries()) {
            if (now >= expireTime) {
                this.cooldowns.delete(key);
            }
        }
    }

    /**
     * Main handler for a message. Checks if it starts with "!", then finds
     * the command in either normal or admin collections, handles perms & cooldowns.
     */
async handleCommand(message, services) {
    // Only handle messages starting with '!'
    if (!message.content.startsWith('!')) return;

    // Parse command name and args
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
        // Check if command is being used in DMs
        const isDM = !message.guild;
        if (isDM) {
            // Admin commands are never allowed in DMs
            if (isAdminCommand) {
                await message.channel.send(
                    '```ansi\n\x1b[32m[ERROR] Admin commands cannot be used in DMs\n[Ready for input]█\x1b[0m```'
                );
                return;
            }

            // Check if this command is allowed in DMs
            if (!DM_ALLOWED_COMMANDS.has(commandName)) {
                await message.channel.send(
                    '```ansi\n\x1b[32m[ERROR] This command can only be used in the server\n[Ready for input]█\x1b[0m```'
                );
                return;
            }
        }

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
    } catch (error) {
        ErrorHandler.logError(error, `Command Execution: ${commandName}`);
        await message.channel.send(
            '```ansi\n\x1b[32m[ERROR] Command execution failed\n[Ready for input]█\x1b[0m```'
        );
    }
}

    /**
     * Utility to reload a single command by name, searching both
     * normal and admin directories.
     */
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
            ErrorHandler.logError(error, `Reloading command: ${commandName}`);
            return false;
        }
    }
}

module.exports = CommandHandler;

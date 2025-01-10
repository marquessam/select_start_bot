import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { Collection, PermissionFlagsBits } from 'discord.js';
import ErrorHandler from '../utils/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CommandHandler {
    constructor() {
        this.commands = new Collection();
        this.adminCommands = new Collection();
        this.cooldowns = new Map();
        this.config = {
            defaultCooldown: 3000,
            adminCooldown: 1000,
            commandsPath: join(__dirname, '..', 'commands'),
            adminCommandsPath: join(__dirname, '..', 'commands', 'admin')
        };
    }

    async loadCommands(dependencies) {
        try {
            this.commands.clear();
            this.adminCommands.clear();

            await this._loadCommandsFromDirectory(this.config.commandsPath, this.commands, false);

            if (fs.existsSync(this.config.adminCommandsPath)) {
                await this._loadCommandsFromDirectory(this.config.adminCommandsPath, this.adminCommands, true);
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
        const commandFiles = fs.readdirSync(dirPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = join(dirPath, file);
            try {
                // Use dynamic import to load the module
                const module = await import(filePath + `?update=${Date.now()}`);
                const command = module.default || module;
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
            member.permissions.has(PermissionFlagsBits.Administrator) ||
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
        const duration = isAdmin ? this.config.adminCooldown : this.config.defaultCooldown;
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

        let command = this.commands.get(commandName);
        let isAdminCommand = false;
        if (!command) {
            command = this.adminCommands.get(commandName);
            isAdminCommand = !!command;
        }
        if (!command) return;

        try {
            if (isAdminCommand && !this.hasAdminPermission(message)) {
                await message.channel.send(
                    '```ansi\n\x1b[32m[ERROR] Insufficient permissions\n[Ready for input]█\x1b[0m```'
                );
                return;
            }
            if (this.isOnCooldown(message.author.id, commandName, isAdminCommand)) {
                await message.channel.send(
                    '```ansi\n\x1b[32m[ERROR] Command on cooldown\n[Ready for input]█\x1b[0m```'
                );
                return;
            }
            await command.execute(message, args, services);
        } catch (error) {
            ErrorHandler.logError(error, `Command Execution: ${commandName}`);
            await message.channel.send(
                '```ansi\n\x1b[32m[ERROR] Command execution failed\n[Ready for input]█\x1b[0m```'
            );
        }
    }

    async reloadCommand(commandName) {
        try {
            const nameLower = commandName.toLowerCase();
            this.commands.delete(nameLower);
            this.adminCommands.delete(nameLower);

            const regularPath = join(this.config.commandsPath, `${nameLower}.js`);
            if (fs.existsSync(regularPath)) {
                const module = await import(regularPath + `?update=${Date.now()}`);
                const cmd = module.default || module;
                cmd.isAdmin = false;
                this.commands.set(nameLower, cmd);
                return true;
            }

            const adminPath = join(this.config.adminCommandsPath, `${nameLower}.js`);
            if (fs.existsSync(adminPath)) {
                const module = await import(adminPath + `?update=${Date.now()}`);
                const cmd = module.default || module;
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

export default CommandHandler;

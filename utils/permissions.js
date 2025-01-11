// utils/permissions.js
const { PermissionsBitField } = require('discord.js');
const { ErrorHandler, BotError } = require('./errorHandler');

class PermissionsManager {
    constructor() {
        this.adminRoleId = process.env.ADMIN_ROLE_ID;
        this.moderatorRoleId = process.env.MODERATOR_ROLE_ID;
    }

    hasAdminPermission(member) {
        if (!member) return false;
        
        return (
            member.permissions.has(PermissionsBitField.Flags.Administrator) ||
            member.roles.cache.has(this.adminRoleId)
        );
    }

    hasModeratorPermission(member) {
        if (!member) return false;

        return (
            this.hasAdminPermission(member) ||
            member.roles.cache.has(this.moderatorRoleId)
        );
    }

    async checkChannelPermissions(channel, requiredPermissions) {
        if (!channel || !channel.guild) {
            throw new BotError(
                'Invalid channel context',
                ErrorHandler.ERROR_TYPES.PERMISSION,
                'Channel Permissions'
            );
        }

        const botMember = channel.guild.members.me;
        const permissions = channel.permissionsFor(botMember);

        const missingPermissions = [];
        for (const permission of requiredPermissions) {
            if (!permissions.has(permission)) {
                missingPermissions.push(permission);
            }
        }

        return {
            hasPermissions: missingPermissions.length === 0,
            missing: missingPermissions
        };
    }

    async validateCommand(message, command) {
        try {
            // Check if command requires admin
            if (command.requiresAdmin && !this.hasAdminPermission(message.member)) {
                throw new BotError(
                    'This command requires administrator permissions',
                    ErrorHandler.ERROR_TYPES.PERMISSION,
                    'Command Validation'
                );
            }

            // Check if command requires moderator
            if (command.requiresModerator && !this.hasModeratorPermission(message.member)) {
                throw new BotError(
                    'This command requires moderator permissions',
                    ErrorHandler.ERROR_TYPES.PERMISSION,
                    'Command Validation'
                );
            }

            // Check channel permissions
            if (command.requiredPermissions) {
                const channelPerms = await this.checkChannelPermissions(
                    message.channel,
                    command.requiredPermissions
                );

                if (!channelPerms.hasPermissions) {
                    throw new BotError(
                        `Missing permissions: ${channelPerms.missing.join(', ')}`,
                        ErrorHandler.ERROR_TYPES.PERMISSION,
                        'Command Validation'
                    );
                }
            }

            return true;
        } catch (error) {
            ErrorHandler.logError(error, 'Permission Validation');
            throw error;
        }
    }
}

module.exports = new PermissionsManager();

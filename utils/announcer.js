const { EmbedBuilder } = require('discord.js');

class Announcer {
    constructor(client, userStats, channelId) {
        this.client = client;
        this.userStats = userStats;
        this.announcementChannelId = channelId || process.env.ANNOUNCEMENT_CHANNEL_ID;

        if (!this.announcementChannelId) {
            console.error('[ANNOUNCER] ERROR: No channel ID provided! Check .env or config.js.');
        }

        this.initialized = false;
    }

    setServices(services) {
        this.services = services;
        console.log('[ANNOUNCER] Services linked:', Object.keys(services));
    }

    async initialize() {
        try {
            console.log('[DEBUG] ANNOUNCER CHANNEL ID:', this.announcementChannelId);

            if (!this.announcementChannelId) {
                throw new Error('[ANNOUNCER] ERROR: Announcement channel ID is undefined! Check your .env or config.js.');
            }

            const channel = await this.client.channels.fetch(this.announcementChannelId).catch(() => {
                console.error(`[ANNOUNCER] ERROR: Failed to fetch channel: ${this.announcementChannelId}`);
                return null;
            });

            if (!channel) {
                console.error(`[ANNOUNCER] ERROR: The bot cannot access channel: ${this.announcementChannelId}`);
                return;
            }

            // Schedule monthly events
            this.setupMonthlyEvents();

            console.log('[ANNOUNCER] Initialization complete');
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('[ANNOUNCER] Initialization error:', error);
            throw error;
        }
    }

    async announceMessage(messageText) {
        try {
            if (!this.initialized) {
                console.warn('[ANNOUNCER] WARNING: Announcer is not initialized!');
                return;
            }

            if (!this.announcementChannelId) {
                console.error('[ANNOUNCER] ERROR: No announcement channel ID set!');
                return;
            }

            const channel = await this.client.channels.fetch(this.announcementChannelId).catch(() => {
                console.error(`[ANNOUNCER] ERROR: Failed to fetch channel: ${this.announcementChannelId}`);
                return null;
            });

            if (!channel) {
                console.error('[ANNOUNCER] ERROR: Unable to find announcement channel.');
                return;
            }

            if (!channel.permissionsFor(this.client.user)?.has(['SEND_MESSAGES', 'VIEW_CHANNEL'])) {
                console.error('[ANNOUNCER] ERROR: Bot does not have permission to send messages in the announcement channel.');
                return;
            }

            await channel.send(messageText);
            console.log('[ANNOUNCER] Successfully sent announcement.');
        } catch (error) {
            console.error('[ANNOUNCER] ERROR sending announcement:', error);
        }
    }

    async announceEmbed(title, description, color = '#FFD700') {
        try {
            if (!this.initialized) {
                console.warn('[ANNOUNCER] WARNING: Announcer is not initialized!');
                return;
            }

            if (!this.announcementChannelId) {
                console.error('[ANNOUNCER] ERROR: No announcement channel ID set!');
                return;
            }

            const channel = await this.client.channels.fetch(this.announcementChannelId).catch(() => {
                console.error(`[ANNOUNCER] ERROR: Failed to fetch channel: ${this.announcementChannelId}`);
                return null;
            });

            if (!channel) {
                console.error('[ANNOUNCER] ERROR: Unable to find announcement channel.');
                return;
            }

            if (!channel.permissionsFor(this.client.user)?.has(['SEND_MESSAGES', 'VIEW_CHANNEL', 'EMBED_LINKS'])) {
                console.error('[ANNOUNCER] ERROR: Bot does not have permission to send embedded messages.');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(description)
                .setTimestamp();

            await channel.send({ embeds: [embed] });
            console.log('[ANNOUNCER] Successfully sent embedded announcement.');
        } catch (error) {
            console.error('[ANNOUNCER] ERROR sending embedded announcement:', error);
        }
    }

    setupMonthlyEvents() {
        console.log('[ANNOUNCER] Setting up monthly events...');
        // Placeholder: Add scheduled events here
    }
}

module.exports = Announcer;

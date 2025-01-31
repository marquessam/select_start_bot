// utils/announcer.js

const TerminalEmbed = require('./embedBuilder');
const database = require('../database');
const { fetchLeaderboardData } = require('../raAPI');

class Announcer {
    constructor(client, userStats, channelId) {
        this.client = client;
        this.userStats = userStats;
        this.announcementChannelId = channelId;
        this.initialized = false;
    }

    async initialize() {
        try {
            console.log('[ANNOUNCER] Initializing...');
            
            // Verify channel exists
            const channel = await this.client.channels.fetch(this.announcementChannelId);
            if (!channel) {
                throw new Error('Announcement channel not found');
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

    setupMonthlyEvents() {
        // This can be expanded later if needed
        console.log('[ANNOUNCER] Monthly events setup complete');
    }

    async handleNewMonth() {
        try {
            // 1. Archive current month
            await this.handleChallengeEnd();
            
            // 2. Switch challenge files
            await this.switchToNextChallenge();
            
            // 3. Announce new challenge
            await this.announceNewChallenge();
        } catch (error) {
            console.error('Month transition error:', error);
            throw error;
        }
    }

    async handleChallengeEnd() {
        try {
            // Fetch final standings
            const data = await fetchLeaderboardData();
            
            // Archive the month
            await this.userStats.archiveLeaderboard(data);
            
            // Announce completion without automatic points
            const embed = new TerminalEmbed()
                .setTerminalTitle('CHALLENGE COMPLETE')
                .setTerminalDescription('[MISSION ACCOMPLISHED]\n[ARCHIVING FINAL RESULTS]')
                .addTerminalField('STATUS UPDATE',
                    'Monthly challenge has concluded\n' +
                    'Final standings have been archived\n' +
                    'Points will be awarded manually')
                .setTerminalFooter();

            await this.makeAnnouncement(embed);

        } catch (error) {
            console.error('Challenge End Error:', error);
            throw error;
        }
    }

    async switchToNextChallenge() {
        try {
            console.log('Starting challenge switch');

            // Get next challenge from database
            const nextChallenge = await database.getNextChallenge();
            if (!nextChallenge) {
                throw new Error('No next challenge found in database');
            }

            // Save next challenge as current
            await database.saveChallenge(nextChallenge, 'current');
            console.log('Saved next challenge as current');

            // Create empty template for next challenge
            const emptyTemplate = {
                gameId: "",
                gameName: "",
                gameIcon: "",
                startDate: "",
                endDate: "",
                rules: [
                    "Hardcore mode must be enabled",
                    "All achievements are eligible",
                    "Progress tracked via retroachievements",
                    "No hacks/save states/cheats allowed"
                ],
                points: {
                    first: 6,
                    second: 4,
                    third: 2
                }
            };

            // Save empty template as next challenge
            await database.saveChallenge(emptyTemplate, 'next');
            console.log('Saved empty template as next challenge');

            // Create announcement about transition
            const embed = new TerminalEmbed()
                .setTerminalTitle('CHALLENGE TRANSITION')
                .setTerminalDescription('[SYSTEM UPDATE]\n[NEW CHALLENGE LOADED]')
                .addTerminalField('STATUS UPDATE', 
                    'Previous challenge archived\nNew challenge activated\nNext challenge template prepared')
                .setTerminalFooter();

            await this.makeAnnouncement(embed);

        } catch (error) {
            console.error('Switch error:', error);
            throw error;
        }
    }

    async announceNewChallenge() {
        const embed = new TerminalEmbed()
            .setTerminalTitle('NEW CHALLENGE INITIATED')
            .setTerminalDescription('[ALERT: NEW MISSION AVAILABLE]\n[OPERATIVES REQUESTED]')
            .addTerminalField('STATUS UPDATE', 
                'New monthly challenge has begun!\nCheck !challenge for mission details')
            .setTerminalFooter();

        await this.makeAnnouncement(embed);
    }

    async makeAnnouncement(embed) {
        try {
            const channel = await this.client.channels.fetch(this.announcementChannelId);
            if (channel) {
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Announcement Error:', error);
            throw error;
        }
    }
}

module.exports = Announcer;

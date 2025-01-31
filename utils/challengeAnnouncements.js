// utils/challengeAnnouncements.js

const TerminalEmbed = require('./embedBuilder');
const { getLastDayOfMonth } = require('./timerFunctions');

class ChallengeAnnouncements {
    constructor(client, announcementChannelId) {
        this.client = client;
        this.channelId = announcementChannelId;
    }

    async setupAnnouncements() {
        // Week warning (23rd of each month at 12:00 PM UTC)
        this.scheduleAnnouncement('0 12 23 * *', async () => {
            const nextMonth = new Date(new Date().setMonth(new Date().getMonth() + 1))
                .toLocaleString('default', { month: 'long' });
            const currentMonth = new Date().toLocaleString('default', { month: 'long' });
            const lastDay = getLastDayOfMonth();
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('CHALLENGE ENDING SOON')
                .setTerminalDescription('[ONE WEEK WARNING]')
                .addTerminalField('SCHEDULE',
                    `The ${currentMonth} challenge ends on ${currentMonth} ${lastDay}.\n` +
                    `The ${nextMonth} challenge begins on ${nextMonth} 1st.`)
                .addTerminalField('ACTION REQUIRED',
                    '• Complete your achievements\n' +
                    '• Submit your nominations for next month\n' +
                    '• Prepare for voting period')
                .setTerminalFooter();

            await this.sendAnnouncement(embed, '@everyone');
        });

        // 48-hour warning (29th of each month at 12:00 PM UTC)
        this.scheduleAnnouncement('0 12 29 * *', async () => {
            const currentMonth = new Date().toLocaleString('default', { month: 'long' });
            const lastDay = getLastDayOfMonth();
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('FINAL COUNTDOWN')
                .setTerminalDescription('[48 HOUR WARNING]')
                .addTerminalField('TIME REMAINING',
                    `The ${currentMonth} challenge ends in 48 hours!\n` +
                    'Complete your achievements before time runs out!')
                .addTerminalField('REMINDER',
                    'Any ties will be settled with Mario Kart: Super Circuit time trials.')
                .setTerminalFooter();

            await this.sendAnnouncement(embed, '@everyone');
        });

        // Month change (midnight on 1st)
        this.scheduleAnnouncement('0 0 1 * *', async () => {
            const month = new Date().toLocaleString('default', { month: 'long' });
            
            const embed = new TerminalEmbed()
                .setTerminalTitle(`${month.toUpperCase()} CHALLENGE BEGINS`)
                .setTerminalDescription('[NEW CHALLENGE ACTIVE]')
                .addTerminalField('STATUS',
                    `The ${month} challenge has officially begun!\n` +
                    'Use !challenge to see the details.')
                .addTerminalField('REMINDER',
                    '• Hardcore mode must be enabled\n' +
                    '• All achievements are eligible\n' +
                    '• Progress tracked via RetroAchievements')
                .setTerminalFooter();

            await this.sendAnnouncement(embed, '@everyone');
        });
    }

    scheduleAnnouncement(cronPattern, callback) {
        const cron = require('node-cron');
        cron.schedule(cronPattern, callback, {
            scheduled: true,
            timezone: "UTC"
        });
    }

    async sendAnnouncement(embed, ping = null) {
        try {
            const channel = await this.client.channels.fetch(this.channelId);
            if (channel) {
                if (ping) {
                    await channel.send(ping);
                }
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Failed to send announcement:', error);
        }
    }
}

module.exports = ChallengeAnnouncements;

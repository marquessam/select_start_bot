// utils/eventTimer.js

const cron = require('node-cron');
const TerminalEmbed = require('./embedBuilder');

class EventTimer {
    constructor(client) {
        this.client = client;
        this.scheduledTasks = new Map();
    }

    // Get the last day of current month
    getLastDayOfMonth() {
        const date = new Date();
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    }

    // Get the correct day for 48-hour warning based on month
    get48HourWarningDay() {
        const lastDay = this.getLastDayOfMonth();
        return lastDay - 2; // 2 days before month end
    }

    // Setup monthly transitions
    setupMonthlyTransitions(announcementChannelId) {
        // 1 week before month end
        this.scheduleTask('monthlyWeekWarning', '0 12 23 * *', async () => {
            const nextMonth = new Date(new Date().setMonth(new Date().getMonth() + 1))
                .toLocaleString('default', { month: 'long' });
            const currentMonth = new Date().toLocaleString('default', { month: 'long' });
            const lastDay = this.getLastDayOfMonth();
            
            const embed = new TerminalEmbed()
                .setTerminalTitle('UPCOMING CHALLENGE')
                .setTerminalDescription('[ONE WEEK WARNING]')
                .addTerminalField('SCHEDULE',
                    `Current ${currentMonth} challenge ends: ${currentMonth} ${lastDay}\n` +
                    `${nextMonth} challenge begins: ${nextMonth} 1st`)
                .setTerminalFooter();

            await this.sendAnnouncement(announcementChannelId, { embeds: [embed] });
        });

        // Dynamic 48-hour warning based on month length
        const updateWarningSchedule = () => {
            const warningDay = this.get48HourWarningDay();
            this.scheduleTask('monthly48Warning', `0 12 ${warningDay} * *`, async () => {
                const currentMonth = new Date().toLocaleString('default', { month: 'long' });
                const lastDay = this.getLastDayOfMonth();
                
                const embed = new TerminalEmbed()
                    .setTerminalTitle('CHALLENGE ENDING SOON')
                    .setTerminalDescription('[48 HOUR WARNING]')
                    .addTerminalField('REMINDER',
                        `${currentMonth} challenge ends on ${currentMonth} ${lastDay}\n` +
                        'Complete your achievements before the month ends!')
                    .setTerminalFooter();

                await this.sendAnnouncement(announcementChannelId, { embeds: [embed] });
            });
        };

        // Update the warning schedule initially and at the start of each month
        updateWarningSchedule();
        this.scheduleTask('updateWarnings', '0 0 1 * *', updateWarningSchedule);

        // Month change (midnight on 1st)
        this.scheduleTask('monthlyTransition', '0 0 1 * *', async () => {
            const month = new Date().toLocaleString('default', { month: 'long' });
            const lastDay = this.getLastDayOfMonth();
            
            const embed = new TerminalEmbed()
                .setTerminalTitle(`${month.toUpperCase()} CHALLENGE BEGINS`)
                .setTerminalDescription('[NEW CHALLENGE ACTIVE]')
                .addTerminalField('STATUS',
                    'Monthly challenge has changed\n' +
                    'Use !challenge to see the new game')
                .addTerminalField('SCHEDULE',
                    `Challenge ends: ${month} ${lastDay}`)
                .setTerminalFooter();

            await this.sendAnnouncement(announcementChannelId, { embeds: [embed], content: '@everyone' });
        });
    }

    // Create a custom scheduled event
    createEvent(name, cronPattern, message) {
        this.scheduleTask(name, cronPattern, async () => {
            const embed = new TerminalEmbed()
                .setTerminalTitle('SCHEDULED EVENT')
                .setTerminalDescription('[EVENT NOTIFICATION]')
                .addTerminalField('EVENT', message)
                .setTerminalFooter();

            await this.sendAnnouncement(process.env.ANNOUNCEMENT_CHANNEL_ID, { embeds: [embed] });
        });
    }

    // Schedule a task using cron
    scheduleTask(name, cronPattern, callback) {
        // Stop existing task if it exists
        if (this.scheduledTasks.has(name)) {
            this.scheduledTasks.get(name).stop();
        }

        // Validate cron pattern
        if (!cron.validate(cronPattern)) {
            throw new Error(`Invalid cron pattern: ${cronPattern}`);
        }

        // Create new task
        const task = cron.schedule(cronPattern, callback, {
            scheduled: true,
            timezone: "UTC" // Server time
        });

        this.scheduledTasks.set(name, task);
    }

    // Helper to send announcements
    async sendAnnouncement(channelId, messageOptions) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (channel) {
                await channel.send(messageOptions);
            }
        } catch (error) {
            console.error('Failed to send announcement:', error);
        }
    }

    // Get list of upcoming events in next 7 days
    getUpcomingEvents() {
        const events = [];
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        this.scheduledTasks.forEach((task, name) => {
            const schedule = task.options;
            // Calculate next occurrence
            // Note: This is a simplified version, you might want to use a cron parser library
            events.push({
                name,
                schedule: schedule.cronTime.toString(),
                // Add other relevant info
            });
        });

        return events;
    }

    // Stop a specific scheduled task
    stopEvent(name) {
        if (this.scheduledTasks.has(name)) {
            this.scheduledTasks.get(name).stop();
            this.scheduledTasks.delete(name);
            return true;
        }
        return false;
    }

    // Stop all scheduled tasks
    stopAllEvents() {
        for (const task of this.scheduledTasks.values()) {
            task.stop();
        }
        this.scheduledTasks.clear();
    }
}

module.exports = EventTimer;

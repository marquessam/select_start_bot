const TerminalEmbed = require('./embedBuilder');
const { fetchLeaderboardData } = require('../raAPI.js');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');

class Announcer {
    constructor(client, userStats, channelId) {
        this.client = client;
        this.userStats = userStats;
        this.announcementChannelId = channelId;
    }

    async initialize() {
        // Schedule monthly events
        // 1st of each month - New Challenge Start
        cron.schedule('0 0 1 * *', () => this.handleNewMonth());
        
        // 25th of month - Nominations Open
        cron.schedule('0 0 25 * *', () => this.announceNominationsOpen());
        
        // 28th of month - Voting Open
        cron.schedule('0 0 28 * *', () => this.announceVotingOpen());
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
        }
    }

    async switchToNextChallenge() {
        try {
            const nextChallengePath = path.join(__dirname, '../nextChallenge.json');
            const challengePath = path.join(__dirname, '../challenge.json');

            // Read next challenge
            const nextChallengeData = await fs.readFile(nextChallengePath, 'utf8');
            const nextChallenge = JSON.parse(nextChallengeData);

            // Update current challenge file
            await fs.writeFile(challengePath, JSON.stringify(nextChallenge, null, 2));

            // Create new empty next challenge template
            const emptyTemplate = {
                currentChallenge: {
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
                }
            };

            await fs.writeFile(nextChallengePath, JSON.stringify(emptyTemplate, null, 2));

            // Create announcement about transition
            const embed = new TerminalEmbed()
                .setTerminalTitle('CHALLENGE TRANSITION')
                .setTerminalDescription('[SYSTEM UPDATE]\n[NEW CHALLENGE LOADED]')
                .addTerminalField('STATUS UPDATE', 
                    'Previous challenge archived\nNew challenge activated\nNext challenge template prepared')
                .setTerminalFooter();

            await this.makeAnnouncement(embed);

        } catch (error) {
            console.error('Error switching challenges:', error);
            throw error;
        }
    }

    // ... rest of your existing announcer code ...
}

module.exports = Announcer;
    async getAnnouncementChannel() {
        return await this.client.channels.fetch(this.announcementChannelId);
    }

    async makeAnnouncement(embed) {
        try {
            const channel = await this.getAnnouncementChannel();
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Announcement Error:', error);
        }
    }

    async announceNewChallenge() {
        const embed = new TerminalEmbed()
            .setTerminalTitle('NEW CHALLENGE INITIATED')
            .setTerminalDescription('[ALERT: NEW CHALLENGE AVAILABLE]\n[USERS REQUESTED]')
            .addTerminalField('STATUS UPDATE', 
                'New monthly challenge has begun!\nCheck !challenge for mission details')
            .setTerminalFooter();

        await this.makeAnnouncement(embed);
    }

    async handleChallengeEnd() {
        try {
            // Fetch final standings
            const data = await fetchLeaderboardData();
            
            // Archive the month
            await this.userStats.archiveLeaderboard(data);
            
            // Update points for top 3
            const month = new Date().toLocaleString('default', { month: 'long' });
            const year = new Date().getFullYear().toString();
            
            const winners = {
                first: data.leaderboard[0]?.username,
                second: data.leaderboard[1]?.username,
                third: data.leaderboard[2]?.username
            };

            await this.userStats.addMonthlyPoints(month, year, winners);

            // Announce winners
            const embed = new TerminalEmbed()
                .setTerminalTitle('CHALLENGE COMPLETE')
                .setTerminalDescription('[MISSION ACCOMPLISHED]\n[CALCULATING FINAL RESULTS]')
                .addTerminalField('CHALLENGE WINNERS',
                    `🥇 ${winners.first || 'None'} - 10 pts\n` +
                    `🥈 ${winners.second || 'None'} - 6 pts\n` +
                    `🥉 ${winners.third || 'None'} - 3 pts`)
                .addTerminalField('STATUS UPDATE',
                    'Monthly challenge has concluded\nPoints have been awarded\nArchive has been updated')
                .setTerminalFooter();

            await this.makeAnnouncement(embed);

        } catch (error) {
            console.error('Challenge End Error:', error);
        }
    }

    async announceNominationsOpen() {
        const embed = new TerminalEmbed()
            .setTerminalTitle('NOMINATIONS OPEN')
            .setTerminalDescription('[ALERT: MISSION SELECTION PHASE]\n[INPUT REQUESTED]')
            .addTerminalField('STATUS UPDATE',
                'Nominations for next month\'s challenge are now open!\nSubmit your game suggestions in the nominations channel.')
            .setTerminalFooter();

        await this.makeAnnouncement(embed);
    }

    async announceVotingOpen() {
        const embed = new TerminalEmbed()
            .setTerminalTitle('VOTING PHASE INITIATED')
            .setTerminalDescription('[ALERT: FINAL SELECTION PHASE]\n[VOTES REQUIRED]')
            .addTerminalField('STATUS UPDATE',
                'Voting for next month\'s challenge has begun!\nCast your votes in the voting channel.')
            .setTerminalFooter();

        await this.makeAnnouncement(embed);
    }
}

module.exports = Announcer;

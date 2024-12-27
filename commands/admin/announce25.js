const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
    name: 'announce2025',
    description: 'Announces the 2025 year-long challenge',
    async execute(message, args) {
        const embed = new TerminalEmbed()
            .setTerminalTitle('2025 YEAR-LONG CHALLENGE')
            .setTerminalDescription('[TRANSMISSION INITIATED]\n[CHALLENGE PARAMETERS FOLLOW]')
            .addTerminalField('MISSION BRIEFING',
                'Join us for a year of retro gaming excellence! Throughout 2025, we\'ll be running monthly ' +
                'retro game challenges, each offering immediate prizes for top performers. But that\'s not all - ' +
                'we\'re introducing a comprehensive point system that tracks your achievements across the entire year. ' +
                'Points can be earned through monthly challenge placements, community event participation, and special ' +
                'achievements. Whether you\'re competing for monthly prizes, accumulating points for year-end rewards, ' +
                'or just enjoying classic games with friends, there\'s something for everyone in this exciting journey ' +
                'through gaming history.')
            .addTerminalField('MONTHLY OPERATIONS',
                '> Each month features a different retro game challenge\n' +
                '> Top 3 placements earn prizes and points:\n' +
                '  - 1st Place: Prize + 6 points\n' +
                '  - 2nd Place: Prize + 4 points\n' +
                '  - 3rd Place: Prize + 2 points')
            .addTerminalField('MASTERY BONUS',
                '> Earn 5 additional points for achieving Mastery\n' +
                '> Mastery = 100% achievement completion\n' +
                '> Applies to any monthly challenge game\n' +
                '> Can be earned at any time during 2025')
            .addTerminalField('BONUS OBJECTIVES',
                '> Earn bonus points through community participation\n' +
                '> Special events and activities offer point opportunities\n' +
                '> Extra points awarded for community achievements')
            .addTerminalField('FINAL MISSION - DECEMBER 2025',
                '> Special prizes awarded based on total points\n' +
                '> Year-long achievements celebrated\n' +
                '> Community recognition for top performers')
            .addTerminalField('COMMAND PROTOCOLS',
                '!challenge - View current month\'s game and rules\n' +
                '!leaderboard - See current month\'s rankings\n' +
                '!profile <user> - View detailed stats and points\n' +
                '!yearlyboard - See overall 2025 standings\n' +
                '!viewarchive <month> - Access previous results\n' +
                '!nominations - View future game candidates')
            .addTerminalField('STATUS',
                'Track your progress, compete with friends, and join our community events ' +
                'to earn points throughout the year!')
            .setTerminalFooter();

        await message.channel.send({ embeds: [embed] });
        await message.channel.send('```ansi\n\x1b[32m> Type !challenge to view the current mission\n[Ready for input]█\x1b[0m```');
        
        // Add shadow game hint after a short delay
        setTimeout(async () => {
            await message.channel.send('```ansi\n\x1b[31mERROR 0xF7A2: Memory address FFT_0x4322 corrupted\nExpected value \'highpotion_price\' not found\nAttempting recovery...\x1b[0m```');
        }, 2000);
    }
};

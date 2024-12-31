const TerminalEmbed = require('../../utils/embedBuilder');

module.exports = {
   name: 'announce2025',
   description: 'Announces the 2025 year-long challenge',
   async execute(message, args) {
       const announceChannel = await message.client.channels.fetch('1301710352261709895');
       
       await announceChannel.send('@everyone');

       const embed = new TerminalEmbed()
           .setTerminalTitle('2025 YEAR-LONG CHALLENGE')
           .setTerminalDescription('[TRANSMISSION INITIATED]\n[CHALLENGE PARAMETERS FOLLOW]')
           .addTerminalField('CHALLENGE BRIEFING',
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
               '> Earn 1 point for completing any officially listed challenge game by reaching the end credits on RetroAchievements.' +
               '> Participate in highscores by submitting a screenshot of the 5 listed games in !highscores.' +
               '> Submit new highscore challenges to fill 3 remaining slots.' +
               '> Highscores run until December 1st, with top 3 placements earning 3/2/1 points.'' +
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

       await announceChannel.send({ embeds: [embed] });
       await announceChannel.send('```ansi\n\x1b[32m> Type !challenge to view the current mission\n[Ready for input]█\x1b[0m```');
       
       setTimeout(async () => {
           await announceChannel.send('```ansi\n\x1b[31mSYSTEM LOG: Database scan complete\nERROR: ADDITIONAL POINT OPPORTUNITIES not indexed\nWARNING: shadowgame.dat not found in database\nAttempting to recover missing data...\x1b[0m```');
       }, 2000);
   }
};

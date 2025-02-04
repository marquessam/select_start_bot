// commands/leaderboard.js
module.exports = {
  name: 'leaderboard',
  description: 'Show monthly or yearly leaderboard',

  async execute(message, args, { achievementSystem, database }) {
    // usage: "!leaderboard month" or "!leaderboard year"
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'year') {
      await this.showYearly(message, achievementSystem);
    } else {
      await this.showMonthly(message, achievementSystem);
    }
  },

  async showMonthly(message, achievementSystem) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());

    // We'll fetch all valid users from the database
    const validUsers = await achievementSystem.database.getValidUsers();

    // For each, sum their monthly points
    const rows = [];
    for (const username of validUsers) {
      const { totalPoints } = await achievementSystem.calculatePoints(username, month, year);
      if (totalPoints > 0) {
        rows.push({ username, points: totalPoints });
      }
    }

    rows.sort((a, b) => b.points - a.points);

    if (rows.length === 0) {
      await message.channel.send(`No monthly points found for ${year}-${month}!`);
      return;
    }

    let reply = `**Monthly Leaderboard for ${year}-${month}:**\n`;
    rows.forEach((r, i) => {
      reply += `\n**${i + 1}.** ${r.username} - ${r.points} pts`;
    });

    await message.channel.send(reply);
  },

  async showYearly(message, achievementSystem) {
    const now = new Date();
    const year = String(now.getFullYear());
    const validUsers = await achievementSystem.database.getValidUsers();

    const rows = [];
    for (const username of validUsers) {
      const { totalPoints } = await achievementSystem.calculatePoints(username, null, year);
      if (totalPoints > 0) {
        rows.push({ username, points: totalPoints });
      }
    }

    rows.sort((a, b) => b.points - a.points);

    if (rows.length === 0) {
      await message.channel.send(`No yearly points found for ${year}.`);
      return;
    }

    let reply = `**Yearly Leaderboard for ${year}:**\n`;
    rows.forEach((r, i) => {
      reply += `\n**${i + 1}.** ${r.username} - ${r.points} pts`;
    });

    await message.channel.send(reply);
  }
};

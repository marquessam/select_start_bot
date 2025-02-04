// achievementFeed.js
const { EmbedBuilder } = require('discord.js');

class AchievementFeed {
  constructor(client, database, raAPI, achievementSystem) {
    this.client = client;
    this.database = database;
    this.raAPI = raAPI;
    this.achievementSystem = achievementSystem;

    this.feedChannelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
    this.checkInterval = 5 * 60 * 1000; // 5 min
    this.isChecking = false;

    // We store known achievements in memory so we don't repost duplicates
    this.knownAchievements = new Set();
  }

  async initialize() {
    if (!this.feedChannelId) {
      throw new Error('ACHIEVEMENT_FEED_CHANNEL not set in env');
    }

    // Start the periodic check
    this.checkAchievements();
    setInterval(() => this.checkAchievements(), this.checkInterval);

    console.log('[AchievementFeed] Initialized');
  }

  async checkAchievements() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const all = await this.raAPI.fetchAllRecentAchievements();
      for (const { username, achievements } of all) {
        for (const ach of achievements) {
          // build a unique key 
          const key = `${username}-${ach.ID}-${ach.Date}`;
          if (!this.knownAchievements.has(key)) {
            // post it to Discord
            await this.postAchievement(username, ach);
            // call achievement system to see if it awards monthly/shadow points
            await this.achievementSystem.processAchievement(username, ach);
            // remember it
            this.knownAchievements.add(key);
          }
        }
      }
    } catch (err) {
      console.error('[AchievementFeed] checkAchievements error:', err);
    } finally {
      this.isChecking = false;
    }
  }

  async postAchievement(username, achievement) {
    try {
      const channel = await this.client.channels.fetch(this.feedChannelId);
      if (!channel) return;

      const badgeUrl = achievement.BadgeName
        ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
        : 'https://media.retroachievements.org/Badge/00000.png';

      const embed = new EmbedBuilder()
        .setAuthor({ name: username })
        .setTitle(achievement.Title)
        .setDescription(achievement.Description || 'No description')
        .setThumbnail(badgeUrl)
        .setFooter({ text: `Points: ${achievement.Points}` })
        .setTimestamp(new Date(achievement.Date));

      // Optional: label if it’s a monthly or shadow game 
      // (like [Monthly] or [Shadow]) 
      // you can do logic checking monthConfig if you'd like

      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[AchievementFeed] postAchievement error:', err);
    }
  }
}

module.exports = AchievementFeed;

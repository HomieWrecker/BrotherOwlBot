/**
 * Ping command for Brother Owl
 * Shows bot latency, uptime, and other information
 */

const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  Colors,
  version: discordJsVersion
} = require('discord.js');
const { BOT_CONFIG } = require('../config');
const { log } = require('../utils/logger');
const { formatDuration } = require('../utils/formatting');
const os = require('os');

// Command creation
const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is alive and see connection statistics'),

  /**
   * Execute command
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    try {
      // Initial reply with basic info
      const initialEmbed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setDescription('Calculating ping...')
        .setColor(Colors.Blue)
        .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
        .setTimestamp();

      const sent = await interaction.reply({ 
        embeds: [initialEmbed],
        fetchReply: true 
      });
      
      // Calculate various metrics
      const pingLatency = sent.createdTimestamp - interaction.createdTimestamp;
      const apiLatency = Math.round(client.ws.ping);
      const uptime = formatDuration(client.uptime);
      const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
      const systemUptime = formatDuration(os.uptime() * 1000);
      const serverCount = client.guilds.cache.size;
      
      // Create detailed response embed
      const responseEmbed = new EmbedBuilder()
        .setTitle(`🏓 Pong! - ${BOT_CONFIG.name}`)
        .setDescription(`**Status:** Online and operational`)
        .setColor(getLatencyColor(pingLatency))
        .addFields(
          { name: '📡 Bot Latency', value: `${pingLatency}ms`, inline: true },
          { name: '🌐 API Latency', value: `${apiLatency}ms`, inline: true },
          { name: '⏱️ Uptime', value: uptime, inline: true },
          { name: '🤖 Bot Version', value: BOT_CONFIG.version, inline: true },
          { name: '📚 Discord.js', value: `v${discordJsVersion}`, inline: true },
          { name: '🖥️ Node.js', value: `${process.version}`, inline: true },
          { name: '💾 Memory Usage', value: `${memoryUsage} MB`, inline: true },
          { name: '🖧 Servers', value: `${serverCount}`, inline: true },
          { name: '⌛ System Uptime', value: systemUptime, inline: true }
        )
        .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
        .setTimestamp();

      // Edit the initial reply with the detailed embed
      await interaction.editReply({ 
        embeds: [responseEmbed]
      });
      
      log(`Ping command executed: ${pingLatency}ms`);
    } catch (error) {
      console.error('Error executing ping command:', error);
      
      // Simple error handling
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ There was an error processing the ping command.',
          ephemeral: true
        }).catch(console.error);
      } else {
        await interaction.editReply({
          content: '❌ There was an error processing the ping command.',
          embeds: []
        }).catch(console.error);
      }
    }
  }
};

/**
 * Get color based on latency
 * @param {number} latency - Latency in milliseconds
 * @returns {number} Discord color code
 */
function getLatencyColor(latency) {
  if (latency < 100) return Colors.Green;
  if (latency < 200) return Colors.Yellow;
  return Colors.Red;
}

module.exports = pingCommand;
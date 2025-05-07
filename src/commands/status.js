/**
 * Status command for BrotherOwlManager
 * Shows the current status of various services and connections
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { log } = require('../utils/logger');
const os = require('os');
const { version } = require('../../package.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Shows the current status of the bot and its services'),
    
  /**
   * Execute command
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    log('Executing status command');
    
    try {
      const uptimeSeconds = Math.floor(process.uptime());
      const uptimeFormatted = formatUptime(uptimeSeconds);
      
      // Gather API status info
      const lastTornData = client.tornData || {};
      const lastUpdateTime = lastTornData.lastUpdate ? new Date(lastTornData.lastUpdate) : null;
      const dataAge = lastUpdateTime 
        ? Math.floor((Date.now() - lastUpdateTime) / 1000)
        : null;
      
      const dataSource = lastTornData.source || 'unknown';
      const tornAPIStatus = dataAge !== null
        ? (dataAge < 120 ? '🟢 Online' : '🟡 Delayed')
        : '🔴 Offline';
      
      const embed = new EmbedBuilder()
        .setTitle('BrotherOwlManager Status')
        .setColor(0x0099FF)
        .setDescription('Current status of bot services and connections')
        .addFields(
          { name: 'Bot Version', value: version || 'Unknown', inline: true },
          { name: 'Uptime', value: uptimeFormatted, inline: true },
          { name: 'Memory Usage', value: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`, inline: true },
          { name: 'Torn API Status', value: tornAPIStatus, inline: true },
          { name: 'Data Source', value: dataSource, inline: true },
          { name: 'Last Update', value: lastUpdateTime ? `${dataAge}s ago` : 'Never', inline: true },
          { name: 'Discord Gateway', value: '🟢 Connected', inline: true },
          { name: 'Registered Commands', value: `${client.commands.size}`, inline: true },
          { name: 'Host', value: `Replit`, inline: true }
        )
        .setFooter({ 
          text: `Discord API Latency: ${client.ws.ping}ms • Server Time: ${new Date().toLocaleString()}` 
        });
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in status command:', error);
      await interaction.reply({ 
        content: 'An error occurred while fetching status information. Please try again later.',
        ephemeral: true 
      });
    }
  }
};

/**
 * Format uptime in days, hours, minutes, seconds
 * @param {number} seconds - Uptime in seconds
 * @returns {string} Formatted uptime
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / (3600 * 24));
  seconds -= days * 3600 * 24;
  const hrs = Math.floor(seconds / 3600);
  seconds -= hrs * 3600;
  const mins = Math.floor(seconds / 60);
  seconds -= mins * 60;
  
  let result = '';
  if (days > 0) result += `${days}d `;
  if (hrs > 0) result += `${hrs}h `;
  if (mins > 0) result += `${mins}m `;
  result += `${seconds}s`;
  
  return result;
}
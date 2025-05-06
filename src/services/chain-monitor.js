/**
 * Chain monitoring service for BrotherOwlManager
 * Tracks faction chains and triggers alerts when conditions are met
 */

const { EmbedBuilder } = require('discord.js');
const { getServerConfig } = require('./server-config');
const { log, logError, logWS } = require('../utils/logger');
const { formatTimeRemaining, formatNumber } = require('../utils/formatting');
const { BOT_CONFIG } = require('../config');

// Store last alert times to prevent spam
const lastAlertSent = {};

/**
 * Process chain data for all configured servers
 * @param {Client} client - Discord client instance
 * @param {Object} chainData - Chain data from Torn API
 */
async function processChainData(client, chainData) {
  // Skip if no chain data or client isn't ready
  if (!chainData || !client || !client.isReady()) return;
  
  try {
    // Process for each configured server
    for (const [serverId, config] of Object.entries(client.guilds.cache)) {
      const serverConfig = getServerConfig(serverId);
      
      // Skip if server doesn't have chain alerts configured
      if (!serverConfig || 
          !serverConfig.chainAlerts || 
          !serverConfig.chainAlerts.enabled ||
          !serverConfig.chainAlerts.pingRole ||
          !serverConfig.factionId) {
        continue;
      }
      
      const guild = client.guilds.cache.get(serverId);
      if (!guild) continue;
      
      // Check if the chain data is for this faction
      if (chainData.faction.ID.toString() !== serverConfig.factionId.toString()) {
        continue;
      }
      
      // Get chain configuration
      const { minChain, warningTime, pingRole } = serverConfig.chainAlerts;
      
      // Process chain data
      await checkAndSendChainAlert(guild, chainData, {
        minChain: minChain || 10,
        warningTime: warningTime || 1,
        pingRole
      });
    }
  } catch (error) {
    logError('Error processing chain data:', error);
  }
}

/**
 * Check if a chain alert should be sent and send it if needed
 * @param {Guild} guild - Discord guild
 * @param {Object} chainData - Chain data from Torn API
 * @param {Object} alertConfig - Alert configuration
 */
async function checkAndSendChainAlert(guild, chainData, alertConfig) {
  try {
    const { minChain, warningTime, pingRole } = alertConfig;
    const alertKey = `${guild.id}_${chainData.chain.current}`;
    
    // Skip if no active chain or below minimum threshold
    if (!chainData.chain || !chainData.chain.current || chainData.chain.current < minChain) {
      return;
    }
    
    // Calculate time remaining in minutes
    const timeRemaining = chainData.chain.timeout;
    const minutesRemaining = Math.floor(timeRemaining / 60);
    
    // Check if chain is within warning time
    if (minutesRemaining > warningTime) {
      return;
    }
    
    // Check if we've already alerted for this chain count recently
    const now = Date.now();
    if (lastAlertSent[alertKey] && (now - lastAlertSent[alertKey]) < 5 * 60 * 1000) { // 5 min cooldown
      return;
    }
    
    // Update last alert time
    lastAlertSent[alertKey] = now;
    
    // Create alert embed
    const embed = new EmbedBuilder()
      .setTitle('⚠️ CHAIN ALERT ⚠️')
      .setColor(0xFF0000) // Red for urgent alerts
      .setDescription(`Your faction chain is about to expire!`)
      .addFields(
        { name: 'Current Chain', value: formatNumber(chainData.chain.current), inline: true },
        { name: 'Time Remaining', value: formatTimeRemaining(timeRemaining), inline: true },
        { name: 'Cooldown', value: chainData.chain.cooldown ? formatTimeRemaining(chainData.chain.cooldown) : 'None', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
    
    // Find a suitable channel to send the alert
    // Try system channel, then general, then first text channel
    let targetChannel = guild.systemChannel;
    
    if (!targetChannel) {
      // Look for a general/chat channel
      targetChannel = guild.channels.cache.find(channel => 
        channel.type === 0 && // TextChannel type
        (channel.name.includes('general') || channel.name.includes('chat'))
      );
      
      // If still no channel, use first text channel
      if (!targetChannel) {
        targetChannel = guild.channels.cache.find(channel => channel.type === 0);
      }
    }
    
    if (targetChannel) {
      // Send the alert, pinging the role
      await targetChannel.send({
        content: `<@&${pingRole}> Chain Alert!`,
        embeds: [embed]
      });
      
      log(`Sent chain alert to ${guild.name} [${guild.id}]: Chain ${chainData.chain.current}, ${formatTimeRemaining(timeRemaining)} remaining`);
    }
  } catch (error) {
    logError(`Error sending chain alert to guild ${guild.id}:`, error);
  }
}

module.exports = {
  processChainData
};
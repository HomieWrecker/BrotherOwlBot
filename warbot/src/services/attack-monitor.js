/**
 * Attack monitoring service for BrotherOwlManager
 * Monitors attacks on faction members and posts notifications to a specified channel
 */

const { EmbedBuilder } = require('discord.js');
const { getServerConfig } = require('./server-config');
const { log, logError } = require('../utils/logger');
const { formatDate, formatNumber } = require('../utils/formatting');
const { BOT_CONFIG } = require('../config');
const { getPlayerData } = require('./integrations');

// Store previously processed attacks to avoid duplicates
const processedAttacks = new Set();
// Store the last check time for each server
const lastCheckTimes = {};

/**
 * Start attack monitoring for all configured servers
 * @param {Client} client - Discord client instance
 */
async function startAttackMonitoring(client) {
  setInterval(() => checkAttacks(client), 60000); // Check every minute
  log('Attack monitoring service started');
}

/**
 * Check for new attacks on all configured servers
 * @param {Client} client - Discord client instance
 */
async function checkAttacks(client) {
  if (!client || !client.isReady()) return;
  
  try {
    // Check each server with attack monitoring enabled
    for (const [serverId, guild] of client.guilds.cache) {
      const serverConfig = getServerConfig(serverId);
      
      // Skip if server doesn't have attack monitoring configured or enabled
      if (!serverConfig || 
          !serverConfig.attackMonitoring || 
          !serverConfig.attackMonitoring.enabled ||
          !serverConfig.attackMonitoring.monitorChannel ||
          !serverConfig.factionId ||
          !serverConfig.factionApiKey) {
        continue;
      }
      
      // Get attack monitoring config
      const { monitorChannel } = serverConfig.attackMonitoring;
      const { factionId, factionApiKey } = serverConfig;
      
      // Get the target channel
      const channel = guild.channels.cache.get(monitorChannel);
      if (!channel) continue;
      
      // Check permissions
      const permissions = channel.permissionsFor(client.user);
      if (!permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
        continue;
      }
      
      // Get the last check time or set a default (10 minutes ago)
      const now = Math.floor(Date.now() / 1000);
      if (!lastCheckTimes[serverId]) {
        lastCheckTimes[serverId] = now - 600; // 10 minutes ago on first run
      }
      
      await checkFactionAttacks(guild, channel, factionId, factionApiKey, lastCheckTimes[serverId]);
      
      // Update last check time
      lastCheckTimes[serverId] = now;
    }
  } catch (error) {
    logError('Error checking attacks:', error);
  }
}

/**
 * Check for new attacks on a specific faction
 * @param {Guild} guild - Discord guild
 * @param {TextChannel} channel - Channel to post notifications to
 * @param {string} factionId - Faction ID
 * @param {string} apiKey - API key
 * @param {number} lastCheckTime - Timestamp of last check
 */
async function checkFactionAttacks(guild, channel, factionId, apiKey, lastCheckTime) {
  try {
    // Fetch recent attacks from Torn API
    const response = await fetch(`https://api.torn.com/faction/${factionId}?selections=attacks&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      logError(`API Error checking faction attacks: ${data.error.error}`);
      return;
    }
    
    // Process attacks
    const attacks = data.attacks || {};
    const recentAttacks = Object.values(attacks)
      .filter(attack => {
        // Filter for attacks on faction members
        return attack.defender_faction === parseInt(factionId) &&
               // Only recent attacks
               attack.timestamp > lastCheckTime &&
               // Only if we haven't processed it before
               !processedAttacks.has(attack.code.toString());
      })
      .sort((a, b) => b.timestamp - a.timestamp);
    
    // Process each attack
    for (const attack of recentAttacks) {
      await processAttack(attack, channel, apiKey);
      processedAttacks.add(attack.code.toString());
      
      // Limit the size of the processed attacks set
      if (processedAttacks.size > 1000) {
        // Remove oldest entries
        const toDelete = [...processedAttacks].slice(0, 500);
        for (const item of toDelete) {
          processedAttacks.delete(item);
        }
      }
    }
  } catch (error) {
    logError('Error checking faction attacks:', error);
  }
}

/**
 * Process an individual attack and post notification
 * @param {Object} attack - Attack data
 * @param {TextChannel} channel - Channel to post notification to
 * @param {string} apiKey - API key for additional data fetch
 */
async function processAttack(attack, channel, apiKey) {
  // Get attacker stats if possible
  let attackerStats = null;
  try {
    attackerStats = await getPlayerStats(attack.attacker_id);
  } catch (error) {
    // Silently continue if stats retrieval fails
  }
  
  // Create embed for attack notification
  const result = attack.result === 'Defend' ? '✅ Member Defended' : '❌ Member Defeated';
  const embed = new EmbedBuilder()
    .setTitle(`${result}`)
    .setColor(attack.result === 'Defend' ? 0x00FF00 : 0xFF0000)
    .setDescription(`A faction member was attacked!`)
    .addFields(
      { name: 'Defender', value: `[${attack.defender_name}](https://www.torn.com/profiles.php?XID=${attack.defender_id})`, inline: true },
      { name: 'Attacker', value: `[${attack.attacker_name}](https://www.torn.com/profiles.php?XID=${attack.attacker_id})`, inline: true },
      { name: 'Type', value: attack.attack_type || 'Unknown', inline: true },
      { name: 'Time', value: formatDate(new Date(attack.timestamp * 1000)), inline: true },
      { name: 'View Attack Log', value: `[Attack #${attack.code}](https://www.torn.com/loader.php?sid=attackLog&ID=${attack.code})`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
  
  // Add attacker stats if available
  if (attackerStats) {
    const statsText = formatPlayerStats(attackerStats);
    if (statsText) {
      embed.addFields({ name: '⚔️ Attacker Stats', value: statsText, inline: false });
    }
  }
  
  // Send the embed
  await channel.send({ embeds: [embed] });
  log(`Attack notification sent to channel ${channel.name} in ${channel.guild.name}`);
}

/**
 * Get player stats from available services
 * @param {string} playerId - Player ID
 * @returns {Promise<Object|null>} Player stats or null if not available
 */
async function getPlayerStats(playerId) {
  const services = ['tornstats', 'yata', 'torntools', 'anarchy'];
  
  for (const service of services) {
    try {
      const data = await getPlayerData(service, playerId);
      if (data && data.stats && Object.keys(data.stats).length > 0) {
        return data.stats;
      }
    } catch (error) {
      // Try next service if one fails
      continue;
    }
  }
  
  return null;
}

/**
 * Format player stats for display
 * @param {Object} stats - Player stats
 * @returns {string} Formatted stats text
 */
function formatPlayerStats(stats) {
  if (!stats) return '';
  
  const formatted = [];
  
  // Format each stat if available
  if (stats.strength) formatted.push(`Strength: ${formatNumber(stats.strength)}`);
  if (stats.speed) formatted.push(`Speed: ${formatNumber(stats.speed)}`);
  if (stats.dexterity) formatted.push(`Dexterity: ${formatNumber(stats.dexterity)}`);
  if (stats.defense) formatted.push(`Defense: ${formatNumber(stats.defense)}`);
  
  // Add total if we have all stats
  if (stats.strength && stats.speed && stats.dexterity && stats.defense) {
    const total = stats.strength + stats.speed + stats.dexterity + stats.defense;
    formatted.push(`Total: ${formatNumber(total)}`);
  }
  
  return formatted.length > 0 ? formatted.join('\n') : 'No stats available';
}

module.exports = {
  startAttackMonitoring
};
/**
 * Stats tracking service for BrotherOwlManager
 * Tracks faction statistics over time and provides notifications for significant changes
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');
const { formatNumber, formatPercentChange } = require('../utils/formatting');
const { EmbedBuilder, Colors } = require('discord.js');
const { BOT_CONFIG } = require('../config');

// Data storage
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'faction_stats.json');

// Notification thresholds
const STAT_CHANGE_THRESHOLDS = {
  respect: 5, // 5% change in respect
  level: 0,   // Any level change
  members: 0, // Any change in member count
  territory: 0, // Any change in territory count
  chainCount: 0, // Any change in chain count
  networth: 10, // 10% change in networth
  attack_won: 5, // 5% change in attack wins
  attack_lost: 5, // 5% change in attack losses
  defense_won: 5, // 5% change in defense wins
  defense_lost: 5, // 5% change in defense losses
  money_mugged: 15, // 15% change in money mugged
  best_chain: 0, // Any change in best chain
  revives: 5, // 5% change in revives
  items_used: 10, // 10% change in items used
};

// Stats configurations
let statsConfigs = {};

// Init stats tracking
let factionStats = {};
try {
  if (fs.existsSync(STATS_FILE)) {
    factionStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } else {
    fs.writeFileSync(STATS_FILE, JSON.stringify(factionStats), 'utf8');
  }
} catch (error) {
  logError('Error initializing faction stats:', error);
}

/**
 * Save faction stats to file
 * @returns {boolean} Success state
 */
function saveFactionStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(factionStats, null, 2), 'utf8');
    return true;
  } catch (error) {
    logError('Error saving faction stats:', error);
    return false;
  }
}

/**
 * Get faction stats configuration
 * @param {string} serverId - Discord server ID
 * @returns {Object|null} Stats config or null if not set
 */
function getStatsConfig(serverId) {
  return statsConfigs[serverId] || null;
}

/**
 * Set faction stats configuration
 * @param {string} serverId - Discord server ID
 * @param {Object} config - Stats configuration
 * @returns {boolean} Success state
 */
function setStatsConfig(serverId, config) {
  try {
    statsConfigs[serverId] = {
      ...statsConfigs[serverId],
      ...config
    };
    
    log(`Updated stats config for server ${serverId}`);
    return true;
  } catch (error) {
    logError(`Error setting stats config for ${serverId}:`, error);
    return false;
  }
}

/**
 * Get tracked faction stats
 * @param {string} factionId - Faction ID
 * @returns {Object[]} Array of faction stat entries, newest first
 */
function getFactionStats(factionId) {
  return (factionStats[factionId] || []).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get the latest stats snapshot
 * @param {string} factionId - Faction ID
 * @returns {Object|null} Latest stats or null if none
 */
function getLatestStats(factionId) {
  const stats = getFactionStats(factionId);
  return stats.length > 0 ? stats[0] : null;
}

/**
 * Get period comparison (day, week, month)
 * @param {string} factionId - Faction ID
 * @param {string} period - Period to compare ('day', 'week', 'month')
 * @returns {Object|null} Comparison data or null if not enough data
 */
function getStatComparison(factionId, period) {
  const stats = getFactionStats(factionId);
  if (stats.length < 2) return null;
  
  const latest = stats[0];
  let compareTime;
  
  switch (period) {
    case 'day':
      compareTime = 24 * 60 * 60 * 1000; // 24 hours
      break;
    case 'week':
      compareTime = 7 * 24 * 60 * 60 * 1000; // 7 days
      break;
    case 'month':
      compareTime = 30 * 24 * 60 * 60 * 1000; // 30 days
      break;
    default:
      compareTime = 24 * 60 * 60 * 1000; // Default to day
  }
  
  // Find the closest stat entry to the comparison time
  const targetTime = latest.timestamp - compareTime;
  let closest = stats[1];
  let minDiff = Math.abs(closest.timestamp - targetTime);
  
  for (let i = 2; i < stats.length; i++) {
    const diff = Math.abs(stats[i].timestamp - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = stats[i];
    }
  }
  
  // If the closest entry is too far from target time, use null
  if (minDiff > compareTime * 0.5) {
    return null;
  }
  
  return {
    current: latest,
    previous: closest,
    changes: calculateChanges(latest, closest)
  };
}

/**
 * Calculate percentage changes between two stat points
 * @param {Object} current - Current stats
 * @param {Object} previous - Previous stats
 * @returns {Object} Changes with percentages
 */
function calculateChanges(current, previous) {
  const changes = {};
  
  for (const key in current.stats) {
    if (key in previous.stats) {
      const currentVal = current.stats[key];
      const previousVal = previous.stats[key];
      
      if (typeof currentVal === 'number' && typeof previousVal === 'number') {
        const diff = currentVal - previousVal;
        const percentChange = previousVal !== 0 
          ? (diff / previousVal) * 100 
          : (diff !== 0 ? 100 : 0);
        
        changes[key] = {
          raw: diff,
          percent: percentChange
        };
      }
    }
  }
  
  return changes;
}

/**
 * Update faction stats with new data
 * @param {string} factionId - Faction ID
 * @param {Object} factionData - Faction data from API
 * @returns {Object|null} Changes that exceed thresholds, or null if first update
 */
function updateFactionStats(factionId, factionData) {
  if (!factionData || !factionId) return null;
  
  // Create normalized stats object
  const statsEntry = {
    timestamp: Date.now(),
    stats: {
      respect: factionData.respect || 0,
      level: factionData.level || 0,
      members: Object.keys(factionData.members || {}).length,
      territory: Object.keys(factionData.territory || {}).length,
      // Add more stats below based on what's in the API response
      // Some of these might need to be calculated or accessed differently
      // based on the actual API response structure
      chainCount: factionData.chains?.length || 0,
      networth: factionData.money?.vault || 0,
      attack_won: factionData.stats?.attackswon || 0,
      attack_lost: factionData.stats?.attackslost || 0,
      defense_won: factionData.stats?.defendswon || 0,
      defense_lost: factionData.stats?.defendslost || 0,
      money_mugged: factionData.stats?.moneymugged || 0,
      best_chain: factionData.best_chain || 0,
      revives: factionData.stats?.revives || 0,
      items_used: factionData.stats?.itemsused || 0,
    }
  };
  
  // Initialize faction stats if not exists
  if (!factionStats[factionId]) {
    factionStats[factionId] = [];
  }
  
  // Get the latest stats for comparison
  const latestStats = getLatestStats(factionId);
  
  // Add new entry
  factionStats[factionId].push(statsEntry);
  
  // Limit history to 90 days (approximately 2160 entries at 1 per hour)
  const MAX_ENTRIES = 2160;
  if (factionStats[factionId].length > MAX_ENTRIES) {
    factionStats[factionId] = factionStats[factionId].slice(-MAX_ENTRIES);
  }
  
  // Save updated stats
  saveFactionStats();
  
  // If this is the first entry, no changes to report
  if (!latestStats) {
    return null;
  }
  
  // Calculate changes from latest entry
  const changes = calculateChanges(statsEntry, latestStats);
  
  // Filter for significant changes that exceed thresholds
  const significantChanges = {};
  let hasSignificantChanges = false;
  
  for (const key in changes) {
    const threshold = STAT_CHANGE_THRESHOLDS[key] || 0;
    if (Math.abs(changes[key].percent) >= threshold) {
      significantChanges[key] = changes[key];
      hasSignificantChanges = true;
    }
  }
  
  return hasSignificantChanges ? significantChanges : null;
}

/**
 * Create stats notification embed
 * @param {string} factionId - Faction ID
 * @param {string} factionName - Faction name
 * @param {Object} changes - Significant changes
 * @returns {EmbedBuilder} Stats notification embed
 */
function createStatsNotificationEmbed(factionId, factionName, changes) {
  const embed = new EmbedBuilder()
    .setTitle(`📊 Faction Stats Update: ${factionName}`)
    .setColor(Colors.Blue)
    .setDescription(`The following faction statistics have changed significantly:`)
    .setTimestamp()
    .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Faction ID: ${factionId}` });
  
  // Get the latest stats
  const latest = getLatestStats(factionId);
  
  if (!latest) {
    return embed.setDescription('No faction statistics available.');
  }
  
  // Format stat names for better display
  const statNames = {
    respect: 'Respect',
    level: 'Faction Level',
    members: 'Member Count',
    territory: 'Territory Count',
    chainCount: 'Chain Count',
    networth: 'Vault Balance',
    attack_won: 'Attacks Won',
    attack_lost: 'Attacks Lost',
    defense_won: 'Defenses Won',
    defense_lost: 'Defenses Lost',
    money_mugged: 'Money Mugged',
    best_chain: 'Best Chain',
    revives: 'Revives',
    items_used: 'Items Used'
  };
  
  // Add fields for each significant change
  for (const key in changes) {
    const change = changes[key];
    let value = `**Current:** ${formatNumber(latest.stats[key])}`;
    
    // Format the change
    if (change.raw > 0) {
      value += `\n**Change:** +${formatNumber(change.raw)} (${formatPercentChange(change.percent)})`;
    } else {
      value += `\n**Change:** ${formatNumber(change.raw)} (${formatPercentChange(change.percent)})`;
    }
    
    embed.addFields({ name: statNames[key] || key, value, inline: true });
  }
  
  return embed;
}

/**
 * Process stats updates and send notifications
 * @param {Object} client - Discord client
 * @param {Object} factionData - Faction data from API
 */
async function processStatsUpdate(client, factionData) {
  if (!client || !client.guilds || !factionData) return;
  
  const factionId = factionData.ID;
  if (!factionId) return;
  
  const factionName = factionData.name || `Faction ${factionId}`;
  
  // Update stats and get significant changes
  const significantChanges = updateFactionStats(factionId, factionData);
  
  // If no significant changes, or first update, return
  if (!significantChanges) return;
  
  // Get all servers that have this faction configured
  for (const [serverId, config] of Object.entries(statsConfigs)) {
    // Skip if not enabled or no notification channel
    if (!config.enabled || !config.notificationChannelId) continue;
    
    // Skip if faction ID doesn't match
    if (config.factionId !== factionId) continue;
    
    try {
      // Get guild
      const guild = await client.guilds.fetch(serverId);
      if (!guild) continue;
      
      // Get notification channel
      const channel = await guild.channels.fetch(config.notificationChannelId);
      if (!channel) continue;
      
      // Create and send notification
      const embed = createStatsNotificationEmbed(factionId, factionName, significantChanges);
      await channel.send({ embeds: [embed] });
      
      log(`Sent faction stats notification to ${guild.name} for faction ${factionName}`);
    } catch (error) {
      logError(`Error sending faction stats notification to server ${serverId}:`, error);
    }
  }
}

/**
 * Initialize stats tracking service
 * @param {Client} client - Discord client
 */
function initStatsTrackingService(client) {
  if (!client) return;
  
  // Setup periodic stats check every hour
  setInterval(() => {
    // Only process if client has Torn data
    if (client.tornData) {
      processStatsUpdate(client, client.tornData.faction);
    }
  }, 60 * 60 * 1000); // Check every hour
  
  log('Stats tracking service initialized');
}

module.exports = {
  getStatsConfig,
  setStatsConfig,
  getFactionStats,
  getLatestStats,
  getStatComparison,
  processStatsUpdate,
  initStatsTrackingService
};
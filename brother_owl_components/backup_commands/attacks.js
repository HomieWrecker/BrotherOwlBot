const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatDate, formatNumber } = require('../utils/formatting');
const { BOT_CONFIG } = require('../config');
const { getServerConfig, hasRequiredConfig } = require('../services/server-config');
const { fetchFromService, getPlayerData } = require('../services/integrations');

// Command to monitor attacks on faction members
const attacksCommand = {
  data: new SlashCommandBuilder()
    .setName('attacks')
    .setDescription('Monitor attacks on faction members')
    .addSubcommand(subcommand =>
      subcommand
        .setName('recent')
        .setDescription('Show recent attacks on faction members'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('lookup')
        .setDescription('Look up a specific player')
        .addStringOption(option =>
          option
            .setName('player_id')
            .setDescription('Torn ID of the player to lookup')
            .setRequired(true))),
  
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const { guildId } = interaction;
    
    // Check if faction is configured
    if (!hasRequiredConfig(guildId)) {
      return interaction.reply({
        content: '❌ Faction not configured. An administrator needs to set up the faction using `/faction setup`.',
        ephemeral: true
      });
    }
    
    const serverConfig = getServerConfig(guildId);
    const { factionId, factionApiKey } = serverConfig;
    
    // Handle recent attacks lookup
    if (subcommand === 'recent') {
      await interaction.deferReply();
      
      try {
        // Fetch recent attacks on faction members
        const response = await fetch(`https://api.torn.com/faction/${factionId}?selections=attacks&key=${factionApiKey}`);
        const data = await response.json();
        
        if (data.error) {
          return interaction.editReply(`❌ API Error: ${data.error.error}`);
        }
        
        // Process attack data
        const attacks = data.attacks || {};
        const recentAttacks = Object.values(attacks)
          .filter(attack => attack.defender_faction === parseInt(factionId))
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 10);
        
        if (recentAttacks.length === 0) {
          return interaction.editReply('No recent attacks on faction members found.');
        }
        
        // Create embed for recent attacks
        const embed = new EmbedBuilder()
          .setTitle('🔍 Recent Attacks on Faction Members')
          .setColor(BOT_CONFIG.color)
          .setDescription(`Showing the ${recentAttacks.length} most recent attacks on faction members.`)
          .setTimestamp();
        
        // Add attack information to embed
        for (const attack of recentAttacks) {
          const result = attack.result === 'Defend' ? '✅ Defended' : '❌ Lost';
          const timestamp = formatDate(new Date(attack.timestamp * 1000));
          
          embed.addFields({
            name: `${result} | ${timestamp}`,
            value: `**Defender:** [${attack.defender_name}](https://www.torn.com/profiles.php?XID=${attack.defender_id})\n` +
                   `**Attacker:** [${attack.attacker_name}](https://www.torn.com/profiles.php?XID=${attack.attacker_id})\n` +
                   `**Type:** ${attack.attack_type || 'Unknown'}\n` +
                   `**[View Attack](https://www.torn.com/loader.php?sid=attackLog&ID=${attack.code})**`,
            inline: false
          });
        }
        
        embed.setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Data from Torn API` });
        
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logError('Error fetching recent attacks:', error);
        await interaction.editReply('❌ Error fetching recent attacks. Please try again later.');
      }
    }
    
    // Handle player lookup
    else if (subcommand === 'lookup') {
      const playerId = interaction.options.getString('player_id');
      await interaction.deferReply();
      
      try {
        // First, try to fetch player information from Torn API
        const playerData = await fetchPlayerData(playerId, factionApiKey);
        
        if (!playerData) {
          return interaction.editReply(`❌ Couldn't find player with ID ${playerId}.`);
        }
        
        // Try to get additional player data from other services
        const playerStats = await getAdditionalPlayerStats(playerId);
        
        // Create embed for player information
        const embed = new EmbedBuilder()
          .setTitle(`Player Lookup: ${playerData.name} [${playerId}]`)
          .setColor(BOT_CONFIG.color)
          .setDescription(`Profile information for ${playerData.name}.`)
          .setURL(`https://www.torn.com/profiles.php?XID=${playerId}`)
          .addFields(
            { name: 'Level', value: playerData.level?.toString() || 'Unknown', inline: true },
            { name: 'Faction', value: playerData.faction?.name ? `[${playerData.faction.name}](https://www.torn.com/factions.php?step=profile&ID=${playerData.faction.faction_id})` : 'None', inline: true },
            { name: 'Status', value: playerData.status?.description || 'Unknown', inline: true }
          )
          .setTimestamp();
        
        // Add battle stats if available
        if (playerStats && Object.keys(playerStats).length > 0) {
          const statsText = formatPlayerStats(playerStats);
          if (statsText) {
            embed.addFields({ name: '⚔️ Battle Stats', value: statsText, inline: false });
          }
        }
        
        embed.setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Data from multiple sources` });
        
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logError('Error looking up player:', error);
        await interaction.editReply(`❌ Error looking up player with ID ${playerId}.`);
      }
    }
  }
};

/**
 * Fetch player data from Torn API
 * @param {string} playerId - Torn ID of the player
 * @param {string} apiKey - Torn API key
 * @returns {Promise<Object|null>} Player data or null if not found
 */
async function fetchPlayerData(playerId, apiKey) {
  try {
    const response = await fetch(`https://api.torn.com/user/${playerId}?selections=profile,basic&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      logError(`API Error fetching player data: ${data.error.error}`);
      return null;
    }
    
    return data;
  } catch (error) {
    logError('Error fetching player data:', error);
    return null;
  }
}

/**
 * Get player stats from multiple services
 * @param {string} playerId - Torn player ID
 * @returns {Promise<Object>} Combined player stats from available services
 */
async function getAdditionalPlayerStats(playerId) {
  const services = ['torn', 'yata', 'tornstats', 'torntools', 'anarchy'];
  const stats = {};
  
  for (const service of services) {
    try {
      // Try to get data from each service
      const data = await getPlayerData(service, playerId);
      
      if (data && data.stats) {
        // Store stats from this service
        stats[service] = data.stats;
        
        // If we found good stats, break early
        if (Object.keys(data.stats).length >= 4) {
          break;
        }
      }
    } catch (error) {
      // Silently continue if a service fails
      continue;
    }
  }
  
  return stats;
}

/**
 * Format player stats for display
 * @param {Object} statsData - Player stats from various services
 * @returns {string} Formatted stats text
 */
function formatPlayerStats(statsData) {
  // Choose the most complete set of stats
  let bestSource = null;
  let maxStats = 0;
  
  for (const [source, stats] of Object.entries(statsData)) {
    const statCount = Object.keys(stats).length;
    if (statCount > maxStats) {
      maxStats = statCount;
      bestSource = source;
    }
  }
  
  if (!bestSource || maxStats === 0) return '';
  
  const stats = statsData[bestSource];
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

module.exports = { attacksCommand };
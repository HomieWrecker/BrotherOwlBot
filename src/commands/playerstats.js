const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatNumber, formatDate } = require('../utils/formatting');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const { getUserApiKey } = require('./apikey');
const fs = require('fs');
const path = require('path');

// Stats storage
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'player_stats.json');

// Initialize stats storage
let playerStats = {};
try {
  if (fs.existsSync(STATS_FILE)) {
    playerStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } else {
    fs.writeFileSync(STATS_FILE, JSON.stringify(playerStats), 'utf8');
  }
} catch (error) {
  logError('Error initializing player stats storage:', error);
}

// Player stats command - provides player stats with growth tracking
const playerStatsCommand = {
  data: new SlashCommandBuilder()
    .setName('playerstats')
    .setDescription('View your Torn stats and track growth')
    .addStringOption(option =>
      option
        .setName('source')
        .setDescription('Data source to use')
        .setRequired(false)
        .addChoices(
          { name: 'Torn API (default)', value: 'torn' },
          { name: 'YATA', value: 'yata' },
          { name: 'Anarchy', value: 'anarchy' },
          { name: 'TornStats', value: 'tornstats' },
          { name: 'TornTools', value: 'torntools' }
        )),
  
  async execute(interaction, client) {
    // Get user's API key
    const apiKey = getUserApiKey(interaction.user.id);
    
    if (!apiKey) {
      return interaction.reply({
        content: '❌ You need to set your API key first with `/apikey set`',
        ephemeral: true
      });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    // Get the requested data source
    const source = interaction.options.getString('source') || 'torn';
    
    try {
      // Fetch stats from the appropriate source using our integration service
      const { getPlayerData, SERVICES } = require('../services/integrations');
      const stats = await getPlayerData(source, apiKey);
      
      if (!stats || stats.error) {
        return interaction.editReply({
          content: `❌ Error fetching player stats: ${stats?.error || 'Unknown error'}`
        });
      }
      
      // Get player ID
      const playerId = stats.player_id;
      
      // Check if we have previous stats to compare against
      const previousStats = playerStats[playerId];
      
      // Save current stats for future comparison
      playerStats[playerId] = {
        timestamp: Date.now(),
        stats: {
          level: stats.level,
          experience: stats.experience,
          respect: stats.respect || 0,
          total_battlestats: calculateTotalBattlestats(stats)
        }
      };
      
      // Save to file
      fs.writeFileSync(STATS_FILE, JSON.stringify(playerStats), 'utf8');
      
      // Create the stats embed
      const embed = createStatsEmbed(stats, previousStats, source);
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logError('Error executing player stats command:', error);
      await interaction.editReply({
        content: '❌ There was an error fetching your player stats. Please try again later.'
      });
    }
  }
};

/**
 * Fetch player stats from the specified source
 * @param {string} apiKey - Torn API key
 * @param {string} source - Data source name
 * @returns {Promise<Object>} Player stats data
 */
async function fetchPlayerStats(apiKey, source) {
  let url;
  
  switch (source) {
    case 'yata':
      // YATA uses Torn API under the hood, but could have different endpoints
      url = `https://yata.yt/api/v1/tornstats/?key=${apiKey}`;
      break;
    case 'anarchy':
      url = `https://anarchy.torn.com/api/v1/user/?key=${apiKey}`;
      break;
    case 'tornstats':
      url = `https://www.tornstats.com/api/v1/${apiKey}/stats`;
      break;
    case 'torntools':
      url = `https://torntools.com/api/v1/user/?key=${apiKey}`;
      break;
    case 'torn':
    default:
      // Default to official Torn API
      url = `https://api.torn.com/user/?selections=profile,personalstats,battlestats&key=${apiKey}`;
      break;
  }
  
  try {
    // In a real implementation, we would handle the different response formats from each source
    // For simplicity, we're assuming all sources return similar data or we'd transform it
    const response = await fetch(url);
    const data = await response.json();
    
    // For non-Torn APIs, we'd transform the data to a common format here
    return normalizeStatsData(data, source);
  } catch (error) {
    logError(`Error fetching stats from ${source}:`, error);
    return { error: `Failed to fetch data from ${source}` };
  }
}

/**
 * Normalize stats data from different sources to a common format
 * @param {Object} data - Raw stats data from API
 * @param {string} source - Data source name
 * @returns {Object} Normalized stats data
 */
function normalizeStatsData(data, source) {
  // If there's an error, just return it
  if (data.error) {
    return { error: data.error };
  }
  
  // Handle different source formats
  switch (source) {
    case 'yata':
      // YATA data transformation would go here
      return data;
    case 'anarchy':
      // Anarchy data transformation would go here
      return data;
    case 'tornstats':
      // TornStats data transformation would go here
      return data;
    case 'torntools':
      // TornTools data transformation would go here
      return data;
    case 'torn':
    default:
      // For the official Torn API
      return {
        player_id: data.player_id,
        name: data.name,
        level: data.level,
        experience: data.experience || 0,
        gender: data.gender,
        networth: data.networth || 0,
        strength: data.strength || 0,
        defense: data.defense || 0,
        speed: data.speed || 0,
        dexterity: data.dexterity || 0,
        respect: data.respect || 0,
        faction: data.faction,
        last_action: data.last_action,
        // Additional stats can be extracted from personalstats
        personal_stats: data.personalstats || {}
      };
  }
}

/**
 * Calculate total battlestats from player stats
 * @param {Object} stats - Player stats
 * @returns {number} Total battlestats
 */
function calculateTotalBattlestats(stats) {
  return (stats.strength || 0) + (stats.defense || 0) + (stats.speed || 0) + (stats.dexterity || 0);
}

/**
 * Create a rich embed for player stats
 * @param {Object} stats - Current player stats
 * @param {Object} previousStats - Previous player stats for comparison
 * @param {string} source - Data source name
 * @returns {EmbedBuilder} Stats embed
 */
function createStatsEmbed(stats, previousStats, source) {
  const embed = new EmbedBuilder()
    .setTitle(`${stats.name}'s Stats`)
    .setColor(BOT_CONFIG.color)
    .setTimestamp();
  
  // Add main stats
  embed.addFields(
    { name: 'Level', value: `${stats.level}`, inline: true },
    { name: 'Gender', value: stats.gender || 'Unknown', inline: true }
  );
  
  // Add battle stats
  const battleStats = [
    `Strength: ${formatNumber(stats.strength || 0)}`,
    `Defense: ${formatNumber(stats.defense || 0)}`,
    `Speed: ${formatNumber(stats.speed || 0)}`,
    `Dexterity: ${formatNumber(stats.dexterity || 0)}`,
    `Total: ${formatNumber(calculateTotalBattlestats(stats))}`
  ];
  embed.addFields({ name: 'Battle Stats', value: battleStats.join('\n') });
  
  // Add growth information if we have previous stats
  if (previousStats) {
    const prevStats = previousStats.stats;
    const timeDiff = Date.now() - previousStats.timestamp;
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    
    const growth = [];
    
    if (prevStats.level !== undefined && stats.level !== undefined) {
      const levelDiff = stats.level - prevStats.level;
      if (levelDiff !== 0) {
        growth.push(`Level: +${levelDiff}`);
      }
    }
    
    if (prevStats.total_battlestats !== undefined) {
      const totalBSDiff = calculateTotalBattlestats(stats) - prevStats.total_battlestats;
      if (totalBSDiff > 0) {
        growth.push(`Battlestats: +${formatNumber(totalBSDiff)}`);
      }
    }
    
    // Networth tracking removed as requested
    
    if (growth.length > 0) {
      embed.addFields({ 
        name: `Growth (Last ${daysDiff} days)`, 
        value: growth.join('\n') 
      });
    }
  }
  
  // Add source information
  embed.setFooter({ 
    text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Data from: ${source.charAt(0).toUpperCase() + source.slice(1)}`
  });
  
  return embed;
}

module.exports = { playerStatsCommand };
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatNumber, formatDate } = require('../utils/formatting');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const keyStorageService = require('../services/key-storage-service');
const statTrackerService = require('../services/stat-tracker-service');

// Stats command - track personal battle stats over time
const statsCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View your Torn battle stats and track stat gains'),
  
  /**
   * Handle slash command execution
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    // Get user's API key
    try {
      const apiKey = await keyStorageService.getApiKey(interaction.user.id, 'torn');
      
      if (!apiKey) {
        return interaction.reply({
          content: '❌ You need to set your API key first with `/apikey`',
          ephemeral: true
        });
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      // Fetch player stats from Torn API
      const stats = await fetchPlayerStats(apiKey);
      
      if (!stats || stats.error) {
        return interaction.editReply({
          content: `❌ Error fetching stats: ${stats?.error || 'Unknown error'}`
        });
      }
      
      // Store the current stats for future comparisons
      await statTrackerService.storePlayerStats(stats.player_id, {
        strength: stats.strength || 0,
        defense: stats.defense || 0,
        speed: stats.speed || 0,
        dexterity: stats.dexterity || 0,
        level: stats.level || 0,
        xanax_used: stats.personalstats?.xantaken || 0,
        energy_used: stats.personalstats?.energy || 0
      });
      
      // Get previous stats from the database for comparison
      const latestStats = await statTrackerService.getPlayerLatestStats(stats.player_id);
      const monthAgoStats = await statTrackerService.getPlayerMonthAgoStats(stats.player_id);
      
      // Create and send the stats embed
      const embed = createStatsEmbed(stats, latestStats, monthAgoStats);
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      logError('Error executing stats command:', error);
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ There was an error fetching your stats. Please try again later.'
        });
      } else {
        await interaction.reply({
          content: '❌ There was an error fetching your stats. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};

/**
 * Fetch player stats from the Torn API
 * @param {string} apiKey - Torn API key
 * @returns {Promise<Object>} Player stats data
 */
async function fetchPlayerStats(apiKey) {
  try {
    const url = `https://api.torn.com/user/?selections=profile,battlestats,personalstats&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      return { error: data.error.error };
    }
    
    return {
      player_id: data.player_id,
      name: data.name,
      level: data.level,
      strength: data.strength || 0,
      defense: data.defense || 0,
      speed: data.speed || 0,
      dexterity: data.dexterity || 0,
      personalstats: data.personalstats || {}
    };
  } catch (error) {
    logError('Error fetching stats from Torn API:', error);
    return { error: 'Failed to fetch data from Torn API' };
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
 * @param {Object} currentStats - Current player stats
 * @param {Object} previousStats - Previous player stats for comparison
 * @param {Object} monthAgoStats - Player stats from a month ago
 * @returns {EmbedBuilder} Stats embed
 */
function createStatsEmbed(currentStats, previousStats, monthAgoStats) {
  const embed = new EmbedBuilder()
    .setTitle(`${currentStats.name}'s Battle Stats`)
    .setColor(BOT_CONFIG.color)
    .setTimestamp();
  
  // Calculate total battle stats
  const totalBS = calculateTotalBattlestats(currentStats);
  
  // Add current battle stats
  const battleStatsField = {
    name: 'Current Battle Stats',
    value: `Strength: ${formatNumber(currentStats.strength || 0)}\n` +
           `Defense: ${formatNumber(currentStats.defense || 0)}\n` +
           `Speed: ${formatNumber(currentStats.speed || 0)}\n` +
           `Dexterity: ${formatNumber(currentStats.dexterity || 0)}\n` +
           `Total: ${formatNumber(totalBS)}`
  };
  
  embed.addFields(battleStatsField);
  
  // Add stat gains since last check
  if (previousStats) {
    const strengthGain = currentStats.strength - previousStats.strength;
    const defenseGain = currentStats.defense - previousStats.defense;
    const speedGain = currentStats.speed - previousStats.speed;
    const dexterityGain = currentStats.dexterity - previousStats.dexterity;
    const totalGain = strengthGain + defenseGain + speedGain + dexterityGain;
    
    const lastCheck = new Date(previousStats.timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now - lastCheck) / (1000 * 60 * 60 * 24));
    
    if (totalGain > 0) {
      const statGainsField = {
        name: `Stat Gains (Last ${diffInDays} day${diffInDays !== 1 ? 's' : ''})`,
        value: `Strength: +${formatNumber(strengthGain)}\n` +
               `Defense: +${formatNumber(defenseGain)}\n` +
               `Speed: +${formatNumber(speedGain)}\n` +
               `Dexterity: +${formatNumber(dexterityGain)}\n` +
               `Total: +${formatNumber(totalGain)}`
      };
      
      embed.addFields(statGainsField);
    }
  }
  
  // Add stat gains since a month ago
  if (monthAgoStats) {
    const strengthGain = currentStats.strength - monthAgoStats.strength;
    const defenseGain = currentStats.defense - monthAgoStats.defense;
    const speedGain = currentStats.speed - monthAgoStats.speed;
    const dexterityGain = currentStats.dexterity - monthAgoStats.dexterity;
    const totalGain = strengthGain + defenseGain + speedGain + dexterityGain;
    
    const lastMonth = new Date(monthAgoStats.timestamp);
    const statGainsMonthField = {
      name: `Monthly Stat Gains (Since ${formatDate(lastMonth)})`,
      value: `Strength: +${formatNumber(strengthGain)}\n` +
             `Defense: +${formatNumber(defenseGain)}\n` +
             `Speed: +${formatNumber(speedGain)}\n` +
             `Dexterity: +${formatNumber(dexterityGain)}\n` +
             `Total: +${formatNumber(totalGain)}`
    };
    
    embed.addFields(statGainsMonthField);
  }
  
  // Add footer
  embed.setFooter({ 
    text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Stats tracking enabled` 
  });
  
  return embed;
}

module.exports = statsCommand;
/**
 * Battle Stats command for BrotherOwlManager
 * Provides detailed battle stat information about players using multiple data sources
 * 
 * This command is built with complete isolation from core bot functionality
 * to ensure errors in prediction or API issues cannot affect the bot.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatNumber } = require('../utils/formatting');
const { getUserApiKey } = require('./apikey');
const battleStatsTracker = require('../services/battlestats-tracker');

// Isolated error handling to prevent disrupting the bot
async function safeExecute(callback) {
  try {
    return await callback();
  } catch (error) {
    logError('Error in battle stats command:', error);
    return {
      error: true,
      message: `Error: ${error.message || 'Unknown error occurred'}`
    };
  }
}

const battlestatsCommand = {
  data: new SlashCommandBuilder()
    .setName('battlestats')
    .setDescription('Get detailed battle stat information about players')
    .addSubcommand(subcommand =>
      subcommand
        .setName('lookup')
        .setDescription('Look up battle stats for a specific player')
        .addStringOption(option =>
          option.setName('player_id')
            .setDescription('Torn player ID to look up')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('refresh')
            .setDescription('Force refresh from available sources')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('compare')
        .setDescription('Compare your stats against another player')
        .addStringOption(option =>
          option.setName('player_id')
            .setDescription('Torn player ID to compare against')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('fairfight')
        .setDescription('Calculate fair fight multiplier based on stats')
        .addStringOption(option =>
          option.setName('player_id')
            .setDescription('Torn player ID to calculate fair fight for')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('sources')
        .setDescription('View information about data sources for a player')
        .addStringOption(option =>
          option.setName('player_id')
            .setDescription('Torn player ID to check sources for')
            .setRequired(true))),
    
  /**
   * Execute command with safe error handling
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    await interaction.deferReply();
    
    const result = await safeExecute(async () => {
      // Verify we have an API key
      const apiKey = getUserApiKey(interaction.user.id);
      if (!apiKey) {
        return {
          error: true,
          message: 'You need to set your API key first using `/apikey`'
        };
      }
      
      // Get subcommand
      const subcommand = interaction.options.getSubcommand();
      const playerId = interaction.options.getString('player_id');
      
      // Execute appropriate subcommand
      switch (subcommand) {
        case 'lookup':
          return handleLookupSubcommand(interaction, apiKey, playerId);
          
        case 'compare':
          return handleCompareSubcommand(interaction, apiKey, playerId);
          
        case 'fairfight':
          return handleFairFightSubcommand(interaction, apiKey, playerId);
          
        case 'sources':
          return handleSourcesSubcommand(interaction, apiKey, playerId);
          
        default:
          return {
            error: true,
            message: 'Unknown subcommand'
          };
      }
    });
    
    if (result.error) {
      await interaction.editReply({ content: result.message });
      return;
    }
    
    if (result.embeds) {
      await interaction.editReply({
        content: result.content || null,
        embeds: result.embeds,
        components: result.components || []
      });
    } else {
      await interaction.editReply({ content: result.content });
    }
  },
  
  /**
   * Handle button interactions
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    const result = await safeExecute(async () => {
      const customId = interaction.customId;
      
      if (customId.startsWith('battlestats_refresh_')) {
        await interaction.deferUpdate();
        const playerId = customId.replace('battlestats_refresh_', '');
        
        // Get API key
        const apiKey = getUserApiKey(interaction.user.id);
        if (!apiKey) {
          return {
            error: true,
            message: 'You need to set your API key first using `/apikey`'
          };
        }
        
        // Force refresh and get stats
        return await getPlayerStatsEmbed(playerId, apiKey, true);
      }
      
      if (customId.startsWith('battlestats_fairfight_')) {
        await interaction.deferUpdate();
        const playerId = customId.replace('battlestats_fairfight_', '');
        
        // Get API key
        const apiKey = getUserApiKey(interaction.user.id);
        if (!apiKey) {
          return {
            error: true,
            message: 'You need to set your API key first using `/apikey`'
          };
        }
        
        // Get fair fight calculation
        return await getFairFightEmbed(playerId, apiKey);
      }
      
      if (customId.startsWith('battlestats_sources_')) {
        await interaction.deferUpdate();
        const playerId = customId.replace('battlestats_sources_', '');
        
        // Get API key
        const apiKey = getUserApiKey(interaction.user.id);
        if (!apiKey) {
          return {
            error: true,
            message: 'You need to set your API key first using `/apikey`'
          };
        }
        
        // Get sources information
        return await getSourcesEmbed(playerId, apiKey);
      }
      
      return {
        error: true,
        message: 'Unknown button interaction'
      };
    });
    
    if (result.error) {
      await interaction.editReply({ content: result.message });
      return;
    }
    
    if (result.embeds) {
      await interaction.editReply({
        content: result.content || null,
        embeds: result.embeds,
        components: result.components || []
      });
    } else {
      await interaction.editReply({ content: result.content });
    }
  }
};

/**
 * Handle the lookup subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - API key
 * @param {string} playerId - Player ID to look up
 * @returns {Object} Command result
 */
async function handleLookupSubcommand(interaction, apiKey, playerId) {
  const forceRefresh = interaction.options.getBoolean('refresh') || false;
  return await getPlayerStatsEmbed(playerId, apiKey, forceRefresh);
}

/**
 * Handle the compare subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - API key
 * @param {string} playerId - Player ID to compare against
 * @returns {Object} Command result
 */
async function handleCompareSubcommand(interaction, apiKey, playerId) {
  try {
    // Get the stats for the target player
    const targetPlayerData = await battleStatsTracker.getPlayerStats(playerId, apiKey);
    
    if (!targetPlayerData || !targetPlayerData.battleStats) {
      return {
        error: true,
        message: `Could not retrieve stats for player ${playerId}`
      };
    }
    
    // Get the stats for the user (from Torn API directly)
    const userPlayerData = await battleStatsTracker.getPlayerStats('', apiKey);
    
    if (!userPlayerData || !userPlayerData.battleStats) {
      return {
        error: true,
        message: 'Could not retrieve your own stats using your API key'
      };
    }
    
    // Get the recommendation
    const recommendation = battleStatsTracker.getFightRecommendation(
      playerId, 
      userPlayerData.battleStats
    );
    
    // Create an embed for the comparison
    const embed = new MessageEmbed()
      .setTitle(`Battle Stats Comparison`)
      .setColor(getRecommendationColor(recommendation.recommendation))
      .setDescription(`Comparison between your stats and player ${playerId}`)
      .addField('Recommendation', recommendation.reason)
      .addField('Fair Fight Multiplier', recommendation.fairFight.toFixed(2), true)
      .addField('Potential Reward', `${recommendation.potentialReward.toFixed(2)}x`, true)
      .addField('Confidence', `${Math.round(recommendation.confidence * 100)}%`, true)
      .addField('Your Stats', formatStatsSection(userPlayerData.battleStats), true)
      .addField('Target Stats', formatStatsSection(targetPlayerData.battleStats), true)
      .addField('\u200b', '\u200b', true) // Empty field for alignment
      .addField('Stat Ratio', `Your stats are ${recommendation.statRatio >= 1 ? 
        recommendation.statRatio.toFixed(2) + 'x higher' : 
        (1/recommendation.statRatio).toFixed(2) + 'x lower'}`, true)
      .addField('Data Sources', targetPlayerData.sources.join(', ') || 'None', true)
      .setTimestamp()
      .setFooter({ text: 'Data may not be 100% accurate. Use at your own risk.' });
    
    // Create components
    const components = [
      new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId(`battlestats_refresh_${playerId}`)
          .setLabel('Refresh Data')
          .setStyle('PRIMARY'),
        new MessageButton()
          .setCustomId(`battlestats_fairfight_${playerId}`)
          .setLabel('Fair Fight Details')
          .setStyle('SECONDARY'),
        new MessageButton()
          .setCustomId(`battlestats_sources_${playerId}`)
          .setLabel('Data Sources')
          .setStyle('SECONDARY')
      )
    ];
    
    return {
      embeds: [embed],
      components
    };
  } catch (error) {
    logError(`Error in compare subcommand for player ${playerId}:`, error);
    return {
      error: true,
      message: `Error comparing stats with player ${playerId}: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Handle the fairfight subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - API key
 * @param {string} playerId - Player ID to calculate fair fight for
 * @returns {Object} Command result
 */
async function handleFairFightSubcommand(interaction, apiKey, playerId) {
  return await getFairFightEmbed(playerId, apiKey);
}

/**
 * Handle the sources subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - API key
 * @param {string} playerId - Player ID to check sources for
 * @returns {Object} Command result
 */
async function handleSourcesSubcommand(interaction, apiKey, playerId) {
  return await getSourcesEmbed(playerId, apiKey);
}

/**
 * Get player stats embed
 * @param {string} playerId - Player ID
 * @param {string} apiKey - API key
 * @param {boolean} forceRefresh - Whether to force a refresh
 * @returns {Object} Embed result
 */
async function getPlayerStatsEmbed(playerId, apiKey, forceRefresh = false) {
  try {
    // Get the player stats
    const playerData = await battleStatsTracker.getPlayerStats(playerId, apiKey);
    
    if (!playerData || !playerData.battleStats) {
      return {
        error: true,
        message: `Could not retrieve stats for player ${playerId}`
      };
    }
    
    // Get a formatted summary
    const summary = battleStatsTracker.generateStatsSummary(playerId);
    
    if (summary.error) {
      return {
        error: true,
        message: summary.message
      };
    }
    
    // Create an embed for the stats
    const embed = new MessageEmbed()
      .setTitle(`Battle Stats for Player ${playerId}`)
      .setColor(getConfidenceColor(summary.confidence))
      .setDescription(`Level: ${summary.level || 'Unknown'}`)
      .addField('Total Battle Stats', summary.total, true)
      .addField('Fair Fight', summary.fairFight, true)
      .addField('Confidence', summary.confidence, true)
      .addField('Strength', summary.individual.strength, true)
      .addField('Speed', summary.individual.speed, true)
      .addField('Dexterity', summary.individual.dexterity, true)
      .addField('Defense', summary.individual.defense, true)
      .addField('Data Age', summary.dataAge, true)
      .addField('Sources', summary.sources || 'None', true);
    
    if (summary.isPredicted) {
      embed.addField('⚠️ Prediction Notice', 'Some or all of these stats are predicted and may not be 100% accurate.');
    }
    
    embed.setTimestamp()
      .setFooter({ text: 'Data may not be 100% accurate. Use at your own risk.' });
    
    // Create components
    const components = [
      new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId(`battlestats_refresh_${playerId}`)
          .setLabel('Refresh Data')
          .setStyle('PRIMARY'),
        new MessageButton()
          .setCustomId(`battlestats_fairfight_${playerId}`)
          .setLabel('Fair Fight Details')
          .setStyle('SECONDARY'),
        new MessageButton()
          .setCustomId(`battlestats_sources_${playerId}`)
          .setLabel('Data Sources')
          .setStyle('SECONDARY')
      )
    ];
    
    return {
      embeds: [embed],
      components
    };
  } catch (error) {
    logError(`Error in getPlayerStatsEmbed for player ${playerId}:`, error);
    return {
      error: true,
      message: `Error retrieving stats for player ${playerId}: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Get fair fight embed
 * @param {string} playerId - Player ID
 * @param {string} apiKey - API key
 * @returns {Object} Embed result
 */
async function getFairFightEmbed(playerId, apiKey) {
  try {
    // Get the player stats
    const playerData = await battleStatsTracker.getPlayerStats(playerId, apiKey);
    
    if (!playerData || !playerData.battleStats) {
      return {
        error: true,
        message: `Could not retrieve stats for player ${playerId}`
      };
    }
    
    const stats = playerData.battleStats;
    const fairFight = battleStatsTracker.calculateFairFight(stats.total);
    
    // Create an embed for the fair fight details
    const embed = new MessageEmbed()
      .setTitle(`Fair Fight Details for Player ${playerId}`)
      .setColor(0x3498db)
      .setDescription('Fair Fight is a multiplier applied to rewards when fighting someone with lower stats than you')
      .addField('Total Battle Stats', formatNumber(stats.total), true)
      .addField('Fair Fight Multiplier', fairFight.multiplier.toFixed(2), true)
      .addField('Calculated At', new Date(fairFight.calculatedAt).toLocaleString(), true)
      .addField('Explanation', fairFight.explanation)
      .addField('Fight Rewards', 'Higher Fair Fight multipliers provide better rewards for:')
      .addField('• Money', `${(fairFight.multiplier * 150).toFixed()}% of base amount`, true)
      .addField('• Experience', `${(fairFight.multiplier * 150).toFixed()}% of base amount`, true)
      .addField('• Respect', `${(fairFight.multiplier * 100).toFixed()}% of base amount`, true)
      .setTimestamp()
      .setFooter({ text: 'Fair Fight calculations are approximate and may not be 100% accurate' });
    
    // Create components
    const components = [
      new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId(`battlestats_refresh_${playerId}`)
          .setLabel('Refresh Stats')
          .setStyle('PRIMARY'),
        new MessageButton()
          .setCustomId(`battlestats_sources_${playerId}`)
          .setLabel('Data Sources')
          .setStyle('SECONDARY')
      )
    ];
    
    return {
      embeds: [embed],
      components
    };
  } catch (error) {
    logError(`Error in getFairFightEmbed for player ${playerId}:`, error);
    return {
      error: true,
      message: `Error calculating fair fight for player ${playerId}: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Get sources embed
 * @param {string} playerId - Player ID
 * @param {string} apiKey - API key
 * @returns {Object} Embed result
 */
async function getSourcesEmbed(playerId, apiKey) {
  try {
    // Get the player stats
    const playerData = await battleStatsTracker.getPlayerStats(playerId, apiKey);
    
    if (!playerData || !playerData.sources.length === 0) {
      return {
        error: true,
        message: `No data sources available for player ${playerId}`
      };
    }
    
    // Create an embed for the sources
    const embed = new MessageEmbed()
      .setTitle(`Data Sources for Player ${playerId}`)
      .setColor(0x3498db)
      .setDescription('Information about the data sources used to compile stats')
      .addField('Sources Used', playerData.sources.join(', ') || 'None')
      .setTimestamp();
    
    // Add explanations for each source
    if (playerData.sources.includes('torn')) {
      embed.addField('Torn API', 'Direct data from Torn. Highest reliability. Updated daily.');
    }
    
    if (playerData.sources.includes('tornstats')) {
      embed.addField('TornStats', 'Data from TornStats service. High reliability. Updated every 2 days.');
    }
    
    if (playerData.sources.includes('torntools')) {
      embed.addField('TornTools', 'Data from TornTools service. Good reliability. Updated every 3 days.');
    }
    
    if (playerData.sources.includes('tornpda')) {
      embed.addField('TornPDA', 'Data from TornPDA service. Good reliability. Updated every 3 days.');
    }
    
    if (playerData.sources.includes('yata')) {
      embed.addField('YATA', 'Data from YATA service. Moderate reliability. Updated every 4 days.');
    }
    
    if (playerData.sources.includes('fightAnalysis')) {
      embed.addField('Fight Analysis', 'Data derived from analyzing fight outcomes. Lower reliability.');
    }
    
    if (playerData.sources.includes('prediction')) {
      embed.addField('⚠️ Prediction', 'Stats are partially or fully predicted based on available data. Low reliability.');
    }
    
    embed.setFooter({ text: 'Data reliability varies by source' });
    
    // Create components
    const components = [
      new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId(`battlestats_refresh_${playerId}`)
          .setLabel('Refresh Stats')
          .setStyle('PRIMARY')
      )
    ];
    
    return {
      embeds: [embed],
      components
    };
  } catch (error) {
    logError(`Error in getSourcesEmbed for player ${playerId}:`, error);
    return {
      error: true,
      message: `Error retrieving data sources for player ${playerId}: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Format stats section for embed
 * @param {Object} stats - Battle stats object
 * @returns {string} Formatted stats text
 */
function formatStatsSection(stats) {
  if (!stats) return 'Unknown';
  
  return `**Total**: ${formatNumber(stats.total)}\n` +
         `STR: ${formatNumber(stats.strength)}\n` +
         `SPD: ${formatNumber(stats.speed)}\n` +
         `DEX: ${formatNumber(stats.dexterity)}\n` +
         `DEF: ${formatNumber(stats.defense)}`;
}

/**
 * Get color based on recommendation
 * @param {string} recommendation - Recommendation type
 * @returns {number} Discord color code
 */
function getRecommendationColor(recommendation) {
  switch (recommendation) {
    case 'strong_advantage':
      return 0x2ecc71; // Green
    case 'advantage':
      return 0x27ae60; // Darker green
    case 'fair_fight':
      return 0x3498db; // Blue
    case 'disadvantage':
      return 0xe74c3c; // Red
    case 'strong_disadvantage':
      return 0xc0392b; // Darker red
    default:
      return 0x95a5a6; // Gray
  }
}

/**
 * Get color based on confidence level
 * @param {string} confidence - Confidence level
 * @returns {number} Discord color code
 */
function getConfidenceColor(confidence) {
  switch (confidence) {
    case 'Very High':
      return 0x2ecc71; // Green
    case 'High':
      return 0x27ae60; // Darker green
    case 'Moderate':
      return 0x3498db; // Blue
    case 'Low':
      return 0xe74c3c; // Red
    case 'Very Low':
      return 0xc0392b; // Darker red
    default:
      return 0x95a5a6; // Gray
  }
}

module.exports = { battlestatsCommand };
/**
 * Spy command for BrotherOwlManager
 * Provides detailed intelligence on players by combining multiple data sources
 * 
 * This command is built with complete isolation from core bot functionality
 * to ensure errors in API calls or processing cannot affect the bot.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatNumber } = require('../utils/formatting');
const { getUserApiKey } = require('./apikey');
const tornScraper = require('../utils/torn-scraper');
const statIntegrations = require('../utils/stat-integrations');

// Isolated error handling to prevent disrupting the bot
async function safeExecute(callback) {
  try {
    return await callback();
  } catch (error) {
    logError('Error in spy command:', error);
    return {
      error: true,
      message: `Error: ${error.message || 'Unknown error occurred'}`
    };
  }
}

const spyCommand = {
  data: new SlashCommandBuilder()
    .setName('spy')
    .setDescription('Gather intel on a player using multiple data sources')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('Player ID, name, or profile URL')
        .setRequired(true))
    .addBooleanOption(option =>
      option.setName('refresh')
        .setDescription('Force refresh data from APIs')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('private')
        .setDescription('Show results only to you')
        .setRequired(false)),
    
  /**
   * Execute command with safe error handling
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    const result = await safeExecute(async () => {
      // Defer reply as this might take a bit
      const isPrivate = interaction.options.getBoolean('private') ?? true;
      await interaction.deferReply({ ephemeral: isPrivate });
      
      // Get API key
      const apiKey = getUserApiKey(interaction.user.id);
      if (!apiKey) {
        return {
          error: true,
          message: 'You need to set your API key first using `/apikey`'
        };
      }
      
      // Parse player input
      const playerInput = interaction.options.getString('player');
      const forceRefresh = interaction.options.getBoolean('refresh') || false;
      
      // Try to parse the player input (ID, name, or URL)
      const playerId = parsePlayerId(playerInput);
      
      if (!playerId) {
        // If we don't have an ID yet, try to look up by name
        try {
          const lookupResult = await lookupPlayerByName(playerInput, apiKey);
          if (!lookupResult) {
            return {
              error: true,
              message: `Could not find player with name or ID: ${playerInput}`
            };
          }
          return await getPlayerIntelligence(lookupResult, apiKey, forceRefresh);
        } catch (error) {
          return {
            error: true,
            message: `Error looking up player by name: ${error.message}`
          };
        }
      }
      
      // Get player intelligence data
      return await getPlayerIntelligence(playerId, apiKey, forceRefresh);
    });
    
    if (result.error) {
      await interaction.editReply({ content: result.message });
      return;
    }
    
    await interaction.editReply({
      embeds: result.embeds,
      components: result.components
    });
  },
  
  /**
   * Handle button interactions
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    const result = await safeExecute(async () => {
      const customId = interaction.customId;
      
      // Handle different button actions
      if (customId.startsWith('spy_refresh_')) {
        const playerId = customId.replace('spy_refresh_', '');
        await interaction.deferUpdate();
        
        // Get API key
        const apiKey = getUserApiKey(interaction.user.id);
        if (!apiKey) {
          return {
            error: true,
            message: 'You need to set your API key first using `/apikey`'
          };
        }
        
        // Force refresh data
        return await getPlayerIntelligence(playerId, apiKey, true);
      }
      
      if (customId.startsWith('spy_sources_')) {
        const playerId = customId.replace('spy_sources_', '');
        await interaction.deferUpdate();
        
        // Get API key
        const apiKey = getUserApiKey(interaction.user.id);
        if (!apiKey) {
          return {
            error: true,
            message: 'You need to set your API key first using `/apikey`'
          };
        }
        
        // Show sources view
        return await getPlayerSourcesView(playerId, apiKey);
      }
      
      if (customId.startsWith('spy_details_')) {
        const playerId = customId.replace('spy_details_', '');
        await interaction.deferUpdate();
        
        // Get API key
        const apiKey = getUserApiKey(interaction.user.id);
        if (!apiKey) {
          return {
            error: true,
            message: 'You need to set your API key first using `/apikey`'
          };
        }
        
        // Show details view (main view)
        return await getPlayerIntelligence(playerId, apiKey, false);
      }
      
      return null;
    });
    
    if (result === null) {
      return;
    }
    
    if (result.error) {
      await interaction.editReply({ content: result.message, embeds: [], components: [] });
      return;
    }
    
    await interaction.editReply({
      embeds: result.embeds,
      components: result.components
    });
  }
};

/**
 * Parse a player ID from various input formats
 * @param {string} input - Player input (ID, name, or URL)
 * @returns {string|null} Player ID or null if not found
 */
function parsePlayerId(input) {
  if (!input) return null;
  
  // Check if it's already a numeric ID
  if (/^\d+$/.test(input)) {
    return input;
  }
  
  // Check if it's a Torn profile URL
  const urlMatch = input.match(/torn\.com\/profiles\.php\?XID=(\d+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  
  // Otherwise, assume it's a name and return null
  // We'll need to look it up separately
  return null;
}

/**
 * Look up a player by name using the Torn API
 * @param {string} name - Player name to look up
 * @param {string} apiKey - Torn API key
 * @returns {Promise<string|null>} Player ID or null if not found
 */
async function lookupPlayerByName(name, apiKey) {
  try {
    const response = await fetch(`https://api.torn.com/user/?selections=lookup&lookup=${encodeURIComponent(name)}&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`API Error: ${data.error.error}`);
    }
    
    if (data.user && data.user.length > 0) {
      return data.user[0].player_id.toString();
    }
    
    return null;
  } catch (error) {
    logError(`Error looking up player by name: ${error.message}`);
    throw error;
  }
}

/**
 * Get full player intelligence data
 * @param {string} playerId - Player ID
 * @param {string} apiKey - Torn API key
 * @param {boolean} forceRefresh - Whether to force refresh data
 * @returns {Promise<Object>} Player intelligence data
 */
async function getPlayerIntelligence(playerId, apiKey, forceRefresh = false) {
  try {
    // 1. Get data from Torn API (always up-to-date)
    const apiResponse = await fetch(`https://api.torn.com/user/${playerId}?selections=profile,personalstats,battlestats&key=${apiKey}`);
    const apiData = await apiResponse.json();
    
    if (apiData.error) {
      return {
        error: true,
        message: `API Error: ${apiData.error.error}`
      };
    }
    
    // 2. Try to get data from public profile (if available)
    let profileData = null;
    try {
      profileData = await tornScraper.scrapePlayerProfile(playerId);
    } catch (error) {
      // Ignore errors in profile scraping
      logError(`Error scraping profile for ${playerId}: ${error.message}`);
    }
    
    // 3. Try to get data from other stat services
    const apiKeys = {
      tornstats: apiKey  // We'll just use the same key for now
      // Add other service keys if available
    };
    
    const statsFromOtherSources = await statIntegrations.getPlayerStatsFromAllSources(playerId, apiKeys);
    
    // 4. Compile all data into a single intel object
    const intelligence = {
      id: playerId,
      name: apiData.name,
      level: apiData.level,
      age: apiData.age,
      faction: apiData.faction,
      status: apiData.status,
      lastAction: apiData.last_action,
      stats: {
        // API stats
        api: apiData.battlestats || {
          strength: 0,
          dexterity: 0,
          speed: 0,
          defense: 0
        },
        // Stats from other sources (if available)
        otherSources: statsFromOtherSources?.combinedStats?.battleStats || null,
        confidence: statsFromOtherSources?.confidence || 'Low'
      },
      profile: profileData || {},
      otherData: {
        // Relevant personal stats
        attacksWon: apiData.personalstats?.attackswon || 0,
        attacksLost: apiData.personalstats?.attackslost || 0,
        // Add other relevant stats as needed
      }
    };
    
    // 5. Create Discord embeds and components
    const [embed, components] = createIntelEmbed(intelligence);
    
    return {
      embeds: [embed],
      components
    };
  } catch (error) {
    logError(`Error getting player intelligence for ${playerId}: ${error.message}`);
    return {
      error: true,
      message: `Error getting player intelligence: ${error.message}`
    };
  }
}

/**
 * Create an embed to display player intelligence
 * @param {Object} intelligence - Player intelligence data
 * @returns {Array} Array containing [EmbedBuilder, Array<ActionRowBuilder>]
 */
function createIntelEmbed(intelligence) {
  // Calculate total battle stats
  const apiTotalStats = (intelligence.stats.api?.strength || 0) +
                       (intelligence.stats.api?.dexterity || 0) +
                       (intelligence.stats.api?.speed || 0) +
                       (intelligence.stats.api?.defense || 0);
  
  const otherSourcesTotal = intelligence.stats.otherSources?.total || 0;
  
  // Determine which color to use based on faction status
  let color = 0x0099FF; // Default blue
  
  if (intelligence.faction) {
    if (intelligence.faction.faction_name.toLowerCase().includes('brotherhood')) {
      color = 0x00FF00; // Green for allied or own faction
    } else if (intelligence.faction.faction_name.toLowerCase().includes('enemy')) {
      color = 0xFF0000; // Red for enemy factions
    }
  }
  
  // Create the main embed
  const embed = new EmbedBuilder()
    .setTitle(`Intelligence: ${intelligence.name} [${intelligence.id}]`)
    .setColor(color)
    .setDescription(`Level ${intelligence.level} • ${intelligence.faction?.faction_name || 'No Faction'}${intelligence.faction?.position ? ` • ${intelligence.faction.position}` : ''}`)
    .addFields(
      {
        name: '🔍 Status',
        value: `${intelligence.status?.description || 'Unknown'} • Last Action: ${intelligence.lastAction?.relative || 'Unknown'}`,
        inline: false
      },
      {
        name: '⚔️ Battle Stats',
        value: `Total: ${formatNumber(apiTotalStats)}\n` +
               `Strength: ${formatNumber(intelligence.stats.api?.strength || 0)}\n` +
               `Speed: ${formatNumber(intelligence.stats.api?.speed || 0)}\n` +
               `Dexterity: ${formatNumber(intelligence.stats.api?.dexterity || 0)}\n` +
               `Defense: ${formatNumber(intelligence.stats.api?.defense || 0)}`,
        inline: true
      },
      {
        name: '📊 Other Data',
        value: `Attacks Won: ${formatNumber(intelligence.otherData.attacksWon)}\n` +
               `Attacks Lost: ${formatNumber(intelligence.otherData.attacksLost)}\n` +
               `Win Rate: ${intelligence.otherData.attacksWon + intelligence.otherData.attacksLost > 0 
                 ? `${((intelligence.otherData.attacksWon / (intelligence.otherData.attacksWon + intelligence.otherData.attacksLost)) * 100).toFixed(1)}%`
                 : 'N/A'}`,
        inline: true
      }
    )
    .setFooter({ 
      text: `Intel Confidence: ${intelligence.stats.confidence} • Data from multiple sources` 
    })
    .setTimestamp();
    
  // Add notes if there are discrepancies in the data
  if (otherSourcesTotal > 0 && Math.abs(apiTotalStats - otherSourcesTotal) / apiTotalStats > 0.2) {
    // If there's more than 20% difference, note it
    embed.addFields({
      name: '⚠️ Data Discrepancy',
      value: `Alternative sources suggest different stats (${formatNumber(otherSourcesTotal)} total). Click "View Sources" for details.`,
      inline: false
    });
  }
  
  // Add components (buttons)
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`spy_refresh_${intelligence.id}`)
        .setLabel('Refresh Data')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`spy_sources_${intelligence.id}`)
        .setLabel('View Sources')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
  
  return [embed, components];
}

/**
 * Get player sources view
 * @param {string} playerId - Player ID
 * @param {string} apiKey - Torn API key
 * @returns {Promise<Object>} Player sources data
 */
async function getPlayerSourcesView(playerId, apiKey) {
  try {
    // Get data from other stat services
    const apiKeys = {
      tornstats: apiKey  // We'll just use the same key for now
      // Add other service keys if available
    };
    
    const statsFromOtherSources = await statIntegrations.getPlayerStatsFromAllSources(playerId, apiKeys);
    
    // Get basic player data for the embed
    const apiResponse = await fetch(`https://api.torn.com/user/${playerId}?selections=basic&key=${apiKey}`);
    const apiData = await apiResponse.json();
    
    if (apiData.error) {
      return {
        error: true,
        message: `API Error: ${apiData.error.error}`
      };
    }
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle(`Data Sources: ${apiData.name} [${playerId}]`)
      .setColor(0x0099FF)
      .setDescription('Data available from different sources:')
      .setTimestamp();
    
    // Add Torn API data
    embed.addFields({
      name: 'Torn API',
      value: 'Official data source\nReflects current stats',
      inline: true
    });
    
    // Add fields for other sources if available
    if (statsFromOtherSources.sources.yata) {
      embed.addFields({
        name: 'YATA',
        value: statsFromOtherSources.sources.yata.lastUpdated 
          ? `Last Updated: ${new Date(statsFromOtherSources.sources.yata.playerProfile.timestamp).toLocaleString()}`
          : 'No timestamp available',
        inline: true
      });
    }
    
    if (statsFromOtherSources.sources.tornstats) {
      embed.addFields({
        name: 'TornStats',
        value: statsFromOtherSources.sources.tornstats.playerProfile?.update_time
          ? `Last Updated: ${statsFromOtherSources.sources.tornstats.playerProfile.update_time}`
          : 'No timestamp available',
        inline: true
      });
    }
    
    // Add empty field to align if we have an odd number
    if ((embed.data.fields?.length || 0) % 2 === 0) {
      embed.addFields({ name: '\u200b', value: '\u200b', inline: true });
    }
    
    // Add confidence rating
    embed.addFields({
      name: 'Overall Confidence Rating',
      value: `${statsFromOtherSources.confidence || 'Low'} (based on number and recency of sources)`,
      inline: false
    });
    
    // Add note about interpretation
    embed.addFields({
      name: 'Note',
      value: 'Discrepancies between sources may occur due to different update times or estimation methods.',
      inline: false
    });
    
    // Add back button
    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`spy_details_${playerId}`)
          .setLabel('Back to Details')
          .setStyle(ButtonStyle.Secondary)
      )
    ];
    
    return {
      embeds: [embed],
      components
    };
  } catch (error) {
    logError(`Error getting player sources view for ${playerId}: ${error.message}`);
    return {
      error: true,
      message: `Error getting player sources view: ${error.message}`
    };
  }
}

module.exports = { spyCommand };
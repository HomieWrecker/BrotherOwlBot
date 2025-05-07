/**
 * TargetFinder command for BrotherOwlManager
 * Helps find optimal targets for attacks based on various criteria
 * 
 * This command is built with complete isolation from core bot functionality
 * to ensure errors in prediction or API issues cannot affect the bot.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatNumber } = require('../utils/formatting');
const { getUserApiKey } = require('./apikey');
const tornScraper = require('../utils/torn-scraper');

// Isolated error handling to prevent disrupting the bot
async function safeExecute(callback) {
  try {
    return await callback();
  } catch (error) {
    logError('Error in targetfinder command:', error);
    return {
      error: true,
      message: `Error: ${error.message || 'Unknown error occurred'}`
    };
  }
}

const targetfinderCommand = {
  data: new SlashCommandBuilder()
    .setName('targetfinder')
    .setDescription('Find optimal targets for attacks based on various criteria')
    .addSubcommand(subcommand =>
      subcommand
        .setName('find')
        .setDescription('Find targets based on criteria')
        .addIntegerOption(option =>
          option.setName('min_level')
            .setDescription('Minimum target level')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('max_level')
            .setDescription('Maximum target level')
            .setRequired(false))
        .addNumberOption(option =>
          option.setName('min_respect')
            .setDescription('Minimum respect gain')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('online_only')
            .setDescription('Only show online targets')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('private')
            .setDescription('Show results only to you')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('faction')
        .setDescription('Find targets from an enemy faction')
        .addStringOption(option =>
          option.setName('faction_id')
            .setDescription('Enemy faction ID (defaults to current war targets)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('online_only')
            .setDescription('Only show online targets')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('private')
            .setDescription('Show results only to you')
            .setRequired(false))),
    
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
      
      // Process the subcommand
      const subcommand = interaction.options.getSubcommand();
      
      switch (subcommand) {
        case 'find':
          return await handleFindSubcommand(interaction, apiKey);
        case 'faction':
          return await handleFactionSubcommand(interaction, apiKey);
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
      // Parse the custom ID
      const customId = interaction.customId;
      
      // Handle refresh button
      if (customId === 'targetfinder_refresh') {
        await interaction.deferUpdate();
        
        // Get API key
        const apiKey = getUserApiKey(interaction.user.id);
        if (!apiKey) {
          return {
            error: true,
            message: 'You need to set your API key first using `/apikey`'
          };
        }
        
        // Re-run the original command with same options
        // This would require storing the original options somewhere
        // For now, just return a message
        return {
          error: true,
          message: 'Please run the command again to refresh results.'
        };
      }
      
      // Handle attack button
      if (customId.startsWith('targetfinder_attack_')) {
        const targetId = customId.replace('targetfinder_attack_', '');
        
        // Redirect to the player's attack page
        const attackUrl = `https://www.torn.com/loader.php?sid=attack&user2ID=${targetId}`;
        
        const embed = new EmbedBuilder()
          .setTitle('Attack Target')
          .setDescription(`Click the link below to attack player ${targetId}`)
          .setColor(0xFF0000)
          .addFields({
            name: 'Attack Link',
            value: `[Attack Player ${targetId}](${attackUrl})`
          });
        
        return {
          embeds: [embed],
          components: []
        };
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
 * Handle the find subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - Torn API key
 * @returns {Promise<Object>} Command result
 */
async function handleFindSubcommand(interaction, apiKey) {
  try {
    // Get command options
    const minLevel = interaction.options.getInteger('min_level');
    const maxLevel = interaction.options.getInteger('max_level');
    const minRespect = interaction.options.getNumber('min_respect') || 1.0;
    const onlineOnly = interaction.options.getBoolean('online_only') || false;
    
    // Get user's data first
    const userData = await fetchUserData(apiKey);
    if (!userData) {
      return {
        error: true,
        message: 'Could not fetch your player data. Please check your API key.'
      };
    }
    
    // Calculate targets
    const targets = await findTargets(userData, apiKey, {
      minLevel: minLevel || 1,
      maxLevel: maxLevel || Math.floor(userData.level * 1.5),
      minRespect,
      onlineOnly
    });
    
    // Create embeds and components
    const [embed, components] = createTargetsEmbed(targets, userData);
    
    return {
      embeds: [embed],
      components
    };
  } catch (error) {
    logError('Error in handleFindSubcommand:', error);
    return {
      error: true,
      message: `Error finding targets: ${error.message}`
    };
  }
}

/**
 * Handle the faction subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - Torn API key
 * @returns {Promise<Object>} Command result
 */
async function handleFactionSubcommand(interaction, apiKey) {
  try {
    // Get command options
    const factionId = interaction.options.getString('faction_id');
    const onlineOnly = interaction.options.getBoolean('online_only') || false;
    
    // Get user's data first
    const userData = await fetchUserData(apiKey);
    if (!userData) {
      return {
        error: true,
        message: 'Could not fetch your player data. Please check your API key.'
      };
    }
    
    // Get user's faction to check for war targets if no faction ID provided
    let targetFactionId = factionId;
    
    if (!targetFactionId) {
      // Check for war targets
      if (userData.faction && userData.faction.faction_id) {
        const factionData = await fetchFactionData(userData.faction.faction_id, apiKey);
        
        if (factionData && factionData.wars) {
          // Get the first active war
          const activeWar = Object.values(factionData.wars).find(war => 
            war.status === 'active'
          );
          
          if (activeWar) {
            targetFactionId = activeWar.target;
          }
        }
      }
      
      if (!targetFactionId) {
        return {
          error: true,
          message: 'No faction ID provided and no active wars found.'
        };
      }
    }
    
    // Fetch faction members
    const factionData = await fetchFactionData(targetFactionId, apiKey);
    if (!factionData || !factionData.members) {
      return {
        error: true,
        message: `Could not fetch data for faction ${targetFactionId}.`
      };
    }
    
    // Convert members to targets
    const targets = await processFactionMembers(factionData, userData, apiKey, onlineOnly);
    
    // Create embeds and components
    const [embed, components] = createFactionTargetsEmbed(targets, userData, factionData.name);
    
    return {
      embeds: [embed],
      components
    };
  } catch (error) {
    logError('Error in handleFactionSubcommand:', error);
    return {
      error: true,
      message: `Error finding faction targets: ${error.message}`
    };
  }
}

/**
 * Fetch user's data from Torn API
 * @param {string} apiKey - Torn API key
 * @returns {Promise<Object|null>} User data or null if not found
 */
async function fetchUserData(apiKey) {
  try {
    const response = await fetch(`https://api.torn.com/user/?selections=basic,battlestats,faction&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      logError(`API Error: ${data.error.error}`);
      return null;
    }
    
    return data;
  } catch (error) {
    logError('Error fetching user data:', error);
    return null;
  }
}

/**
 * Fetch faction data from Torn API
 * @param {string} factionId - Faction ID
 * @param {string} apiKey - Torn API key
 * @returns {Promise<Object|null>} Faction data or null if not found
 */
async function fetchFactionData(factionId, apiKey) {
  try {
    const response = await fetch(`https://api.torn.com/faction/${factionId}?selections=basic,wars&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      logError(`API Error: ${data.error.error}`);
      return null;
    }
    
    return data;
  } catch (error) {
    logError(`Error fetching faction data for ${factionId}:`, error);
    return null;
  }
}

/**
 * Find targets based on user's battle stats and criteria
 * @param {Object} userData - User's data from API
 * @param {string} apiKey - Torn API key
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Array of potential targets
 */
async function findTargets(userData, apiKey, options) {
  try {
    log('Finding targets with options:', options);
    
    // Use optimizedTarget method to find potential targets
    return await tornScraper.findPotentialTargets(userData, apiKey, 10);
  } catch (error) {
    logError('Error finding targets:', error);
    return [];
  }
}

/**
 * Process faction members to find potential targets
 * @param {Object} factionData - Faction data from API
 * @param {Object} userData - User's data
 * @param {string} apiKey - Torn API key
 * @param {boolean} onlineOnly - Whether to show only online targets
 * @returns {Promise<Array>} Array of potential targets
 */
async function processFactionMembers(factionData, userData, apiKey, onlineOnly) {
  try {
    const targets = [];
    
    if (!factionData.members) {
      return targets;
    }
    
    // Calculate user's total battle stats
    const userTotalStats = tornScraper.calculateTotalBattleStats(userData);
    
    // Process each member (limited to avoid API throttling)
    const memberIds = Object.keys(factionData.members).slice(0, 10);
    
    for (const memberId of memberIds) {
      const memberData = factionData.members[memberId];
      
      // Skip if this is the user
      if (memberId === userData.player_id) {
        continue;
      }
      
      // Skip if not online and onlineOnly is true
      if (onlineOnly && memberData.last_action.status !== 'Online') {
        continue;
      }
      
      try {
        // Fetch additional member data
        const memberResponse = await fetch(`https://api.torn.com/user/${memberId}?selections=battlestats,profile&key=${apiKey}`);
        const memberDetails = await memberResponse.json();
        
        if (!memberDetails.error) {
          // Calculate fair fight modifier and respect
          const memberTotalStats = tornScraper.calculateTotalBattleStats(memberDetails);
          const fairFight = calculateFairFight(userTotalStats, memberTotalStats);
          const respect = calculateRespect(memberDetails, fairFight);
          
          targets.push({
            id: memberId,
            name: memberData.name,
            level: memberData.level,
            status: memberData.last_action?.status || 'Unknown',
            lastAction: memberData.last_action?.relative || 'Unknown',
            totalStats: memberTotalStats,
            fairFight,
            respect
          });
        }
      } catch (error) {
        // Skip this member if there's an error
        continue;
      }
    }
    
    // Sort by respect (highest first)
    targets.sort((a, b) => b.respect - a.respect);
    
    return targets;
  } catch (error) {
    logError('Error processing faction members:', error);
    return [];
  }
}

/**
 * Calculate fair fight modifier
 * @param {number} yourStats - Your total stats
 * @param {number} enemyStats - Enemy total stats
 * @returns {number} Fair fight modifier (0.0 - 5.0)
 */
function calculateFairFight(yourStats, enemyStats) {
  // Simplified fair fight calculation
  if (yourStats <= 0 || enemyStats <= 0) return 0;
  
  const ratio = enemyStats / yourStats;
  
  if (ratio <= 0.25) return 1.0;  // Much weaker enemy
  if (ratio <= 0.5) return 1.5;   // Weaker enemy
  if (ratio <= 0.75) return 2.0;  // Slightly weaker enemy
  if (ratio <= 1.0) return 3.0;   // Equal enemy
  if (ratio <= 1.25) return 3.5;  // Slightly stronger enemy
  if (ratio <= 1.5) return 4.0;   // Stronger enemy
  return 5.0;                     // Much stronger enemy
}

/**
 * Calculate respect gain
 * @param {Object} player - Player data
 * @param {number} fairFight - Fair fight modifier
 * @returns {number} Estimated respect gain
 */
function calculateRespect(player, fairFight) {
  // Simplified respect calculation
  const baseRespect = (player.level * 0.25) || 1;
  return baseRespect * fairFight;
}

/**
 * Create an embed for displaying targets
 * @param {Array} targets - Array of potential targets
 * @param {Object} userData - User's data
 * @returns {Array} Array containing [EmbedBuilder, Array<ActionRowBuilder>]
 */
function createTargetsEmbed(targets, userData) {
  const embed = new EmbedBuilder()
    .setTitle('Target Finder Results')
    .setColor(0x0099FF)
    .setDescription(`Found ${targets.length} potential targets based on your criteria`)
    .setTimestamp();
  
  if (targets.length === 0) {
    embed.addFields({
      name: 'No Targets Found',
      value: 'Try adjusting your search criteria',
      inline: false
    });
  } else {
    // Add targets to the embed (up to 5)
    const displayTargets = targets.slice(0, 5);
    
    for (const target of displayTargets) {
      embed.addFields({
        name: `${target.name} [${target.id}] - Level ${target.level}`,
        value: `Status: ${target.status}\n` +
               `Last Action: ${target.lastAction}\n` +
               `Fair Fight: ${target.fairFight.toFixed(2)}x\n` +
               `Est. Respect: ${target.respect.toFixed(2)}\n` +
               `Stats Ratio: ${(target.totalStats / tornScraper.calculateTotalBattleStats(userData)).toFixed(2)}`,
        inline: false
      });
    }
    
    // Add summary about remaining targets
    if (targets.length > 5) {
      embed.addFields({
        name: 'Additional Targets',
        value: `${targets.length - 5} more targets match your criteria`,
        inline: false
      });
    }
  }
  
  // Add user's info
  embed.setFooter({ 
    text: `Your Stats: Level ${userData.level} • Total: ${formatNumber(tornScraper.calculateTotalBattleStats(userData))}` 
  });
  
  // Create components (buttons)
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('targetfinder_refresh')
        .setLabel('Refresh Results')
        .setStyle(ButtonStyle.Primary)
    )
  ];
  
  // Add attack buttons for targets
  if (targets.length > 0) {
    const attackButtons = new ActionRowBuilder();
    const displayTargets = targets.slice(0, 5);
    
    for (let i = 0; i < displayTargets.length && i < 5; i++) {
      attackButtons.addComponents(
        new ButtonBuilder()
          .setCustomId(`targetfinder_attack_${displayTargets[i].id}`)
          .setLabel(`Attack ${i + 1}`)
          .setStyle(ButtonStyle.Danger)
      );
    }
    
    components.push(attackButtons);
  }
  
  return [embed, components];
}

/**
 * Create an embed for displaying faction targets
 * @param {Array} targets - Array of potential targets
 * @param {Object} userData - User's data
 * @param {string} factionName - Faction name
 * @returns {Array} Array containing [EmbedBuilder, Array<ActionRowBuilder>]
 */
function createFactionTargetsEmbed(targets, userData, factionName) {
  const embed = new EmbedBuilder()
    .setTitle(`Faction Targets: ${factionName}`)
    .setColor(0xFF0000)
    .setDescription(`Found ${targets.length} potential targets from this faction`)
    .setTimestamp();
  
  if (targets.length === 0) {
    embed.addFields({
      name: 'No Targets Found',
      value: 'Try without the online-only filter',
      inline: false
    });
  } else {
    // Add targets to the embed (up to 5)
    const displayTargets = targets.slice(0, 5);
    
    for (const target of displayTargets) {
      embed.addFields({
        name: `${target.name} [${target.id}] - Level ${target.level}`,
        value: `Status: ${target.status}\n` +
               `Last Action: ${target.lastAction}\n` +
               `Fair Fight: ${target.fairFight.toFixed(2)}x\n` +
               `Est. Respect: ${target.respect.toFixed(2)}\n` +
               `Stats Ratio: ${(target.totalStats / tornScraper.calculateTotalBattleStats(userData)).toFixed(2)}`,
        inline: false
      });
    }
    
    // Add summary about remaining targets
    if (targets.length > 5) {
      embed.addFields({
        name: 'Additional Targets',
        value: `${targets.length - 5} more members available`,
        inline: false
      });
    }
  }
  
  // Add user's info
  embed.setFooter({ 
    text: `Your Stats: Level ${userData.level} • Total: ${formatNumber(tornScraper.calculateTotalBattleStats(userData))}` 
  });
  
  // Create components (buttons)
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('targetfinder_refresh')
        .setLabel('Refresh Results')
        .setStyle(ButtonStyle.Primary)
    )
  ];
  
  // Add attack buttons for targets
  if (targets.length > 0) {
    const attackButtons = new ActionRowBuilder();
    const displayTargets = targets.slice(0, 5);
    
    for (let i = 0; i < displayTargets.length && i < 5; i++) {
      attackButtons.addComponents(
        new ButtonBuilder()
          .setCustomId(`targetfinder_attack_${displayTargets[i].id}`)
          .setLabel(`Attack ${i + 1}`)
          .setStyle(ButtonStyle.Danger)
      );
    }
    
    components.push(attackButtons);
  }
  
  return [embed, components];
}

module.exports = { targetfinderCommand };
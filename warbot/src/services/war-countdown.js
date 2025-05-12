/**
 * War Countdown service for BrotherOwlManager
 * Monitors for upcoming faction wars and manages countdown displays
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');
const { formatTimeRemaining, formatDate } = require('../utils/formatting');
const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  Colors,
  ChannelType
} = require('discord.js');
const { BOT_CONFIG } = require('../config');

// Data storage
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const COUNTDOWN_FILE = path.join(DATA_DIR, 'war_countdowns.json');

// Constants
const WAR_CHECK_INTERVAL = 10 * 60 * 1000; // Check for wars every 10 minutes
const COUNTDOWN_UPDATE_INTERVAL = 60 * 1000; // Update countdowns every minute
const WAR_TYPES = {
  TERRITORY: 'Territory War',
  RAID: 'Faction Raid',
  ASSAULT: 'Assault'
};

// War countdown configurations
let countdownConfigs = {};
try {
  if (fs.existsSync(COUNTDOWN_FILE)) {
    countdownConfigs = JSON.parse(fs.readFileSync(COUNTDOWN_FILE, 'utf8'));
  } else {
    fs.writeFileSync(COUNTDOWN_FILE, JSON.stringify(countdownConfigs), 'utf8');
  }
} catch (error) {
  logError('Error initializing war countdowns:', error);
}

// Active countdown messages
let activeCountdowns = {};
let activeMessageUpdaters = {};

/**
 * Save countdown configurations to file
 * @returns {boolean} Success state
 */
function saveCountdownConfigs() {
  try {
    fs.writeFileSync(COUNTDOWN_FILE, JSON.stringify(countdownConfigs, null, 2), 'utf8');
    return true;
  } catch (error) {
    logError('Error saving war countdown configs:', error);
    return false;
  }
}

/**
 * Get countdown configuration for a server
 * @param {string} serverId - Discord server ID
 * @returns {Object|null} Countdown config or null if not set
 */
function getCountdownConfig(serverId) {
  return countdownConfigs[serverId] || null;
}

/**
 * Set countdown configuration for a server
 * @param {string} serverId - Discord server ID
 * @param {Object} config - Countdown configuration
 * @returns {boolean} Success state
 */
function setCountdownConfig(serverId, config) {
  try {
    // Merge with existing config or create new
    countdownConfigs[serverId] = {
      ...(countdownConfigs[serverId] || {}),
      ...config
    };
    
    saveCountdownConfigs();
    log(`Updated war countdown config for server ${serverId}`);
    return true;
  } catch (error) {
    logError(`Error setting war countdown config for ${serverId}:`, error);
    return false;
  }
}

/**
 * Clear active countdown for a server
 * @param {string} serverId - Discord server ID
 */
function clearActiveCountdown(serverId) {
  try {
    if (activeMessageUpdaters[serverId]) {
      clearInterval(activeMessageUpdaters[serverId]);
      delete activeMessageUpdaters[serverId];
    }
    delete activeCountdowns[serverId];
    log(`Cleared active war countdown for server ${serverId}`);
  } catch (error) {
    logError(`Error clearing active countdown for ${serverId}:`, error);
  }
}

/**
 * Format war data for countdown display
 * @param {Object} warData - War data from API
 * @returns {Object} Formatted war data
 */
function formatWarData(warData) {
  try {
    // Different war types have different structures, normalize to a common format
    const type = determineWarType(warData);
    const formattedData = {
      type,
      start: null,
      end: null,
      opponent: null,
      opponentId: null,
      score: null,
      status: 'unknown'
    };
    
    if (type === WAR_TYPES.TERRITORY) {
      // Format territory war data
      if (warData.території && warData.території.assaulting) {
        formattedData.opponent = warData.території.defender_name || 'Unknown Faction';
        formattedData.opponentId = warData.території.defender_id || '0';
        formattedData.status = 'scheduled';
        formattedData.score = 'N/A';
        
        // Calculate times
        if (warData.території.start_timestamp) {
          formattedData.start = warData.території.start_timestamp * 1000; // Convert to milliseconds
        }
        if (warData.території.end_timestamp) {
          formattedData.end = warData.території.end_timestamp * 1000; // Convert to milliseconds
        }
      }
    } else if (type === WAR_TYPES.RAID) {
      // Format raid data
      if (warData.raid && warData.raid.raiding) {
        formattedData.opponent = warData.raid.defender_name || 'Unknown Faction';
        formattedData.opponentId = warData.raid.defender_id || '0';
        formattedData.status = 'scheduled';
        formattedData.score = 'N/A';
        
        // Calculate times
        if (warData.raid.start_timestamp) {
          formattedData.start = warData.raid.start_timestamp * 1000; // Convert to milliseconds
        }
        if (warData.raid.end_timestamp) {
          formattedData.end = warData.raid.end_timestamp * 1000; // Convert to milliseconds
        }
      }
    } else if (type === WAR_TYPES.ASSAULT) {
      // Format assault data
      if (warData.assault && warData.assault.active) {
        formattedData.opponent = warData.assault.defender_name || 'Unknown Faction';
        formattedData.opponentId = warData.assault.defender_id || '0';
        formattedData.status = 'active';
        
        // Get score if available
        if (warData.assault.score) {
          formattedData.score = `${warData.assault.score.assaulter || 0} - ${warData.assault.score.defender || 0}`;
        }
        
        // Calculate times
        if (warData.assault.start_timestamp) {
          formattedData.start = warData.assault.start_timestamp * 1000; // Convert to milliseconds
        }
        if (warData.assault.end_timestamp) {
          formattedData.end = warData.assault.end_timestamp * 1000; // Convert to milliseconds
        }
      }
    }
    
    return formattedData;
  } catch (error) {
    logError('Error formatting war data:', error);
    return null;
  }
}

/**
 * Determine the type of war from war data
 * @param {Object} warData - War data from API
 * @returns {string} War type
 */
function determineWarType(warData) {
  if (warData.території && warData.території.assaulting) {
    return WAR_TYPES.TERRITORY;
  } else if (warData.raid && warData.raid.raiding) {
    return WAR_TYPES.RAID;
  } else if (warData.assault && warData.assault.active) {
    return WAR_TYPES.ASSAULT;
  }
  return 'Unknown';
}

/**
 * Check if there's an upcoming or ongoing war
 * @param {Object} factionData - Faction data from the Torn API
 * @returns {Object|null} War data or null if no war
 */
function checkForWar(factionData) {
  try {
    if (!factionData) return null;
    
    // Check for territory war
    if (factionData.території && factionData.території.assaulting) {
      return formatWarData(factionData);
    }
    
    // Check for faction raid
    if (factionData.raid && factionData.raid.raiding) {
      return formatWarData(factionData);
    }
    
    // Check for assault
    if (factionData.assault && factionData.assault.active) {
      return formatWarData(factionData);
    }
    
    return null;
  } catch (error) {
    logError('Error checking for war:', error);
    return null;
  }
}

/**
 * Create countdown embed for a war
 * @param {Object} warData - Formatted war data
 * @param {string} factionName - Faction name
 * @param {number} now - Current timestamp
 * @returns {EmbedBuilder} War countdown embed
 */
function createWarCountdownEmbed(warData, factionName, now) {
  try {
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${warData.type} Countdown`)
      .setColor(Colors.Red)
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    let description = `${factionName} is preparing for a ${warData.type.toLowerCase()} against **${warData.opponent}**!\n\n`;
    
    // Add time information
    const currentTime = now || Date.now();
    
    if (warData.start && warData.start > currentTime) {
      // War hasn't started yet
      const timeToStart = Math.max(0, Math.floor((warData.start - currentTime) / 1000));
      description += `**War Begins In:** ${formatTimeRemaining(timeToStart)}\n`;
      description += `**Start Time:** ${formatDate(new Date(warData.start))}\n`;
      
      if (warData.end) {
        description += `**End Time:** ${formatDate(new Date(warData.end))}\n`;
        const warDuration = Math.floor((warData.end - warData.start) / 1000);
        description += `**War Duration:** ${formatTimeRemaining(warDuration)}\n`;
      }
      
      embed.setColor(Colors.Gold); // Gold for upcoming
    } else if (warData.start && warData.end && warData.end > currentTime) {
      // War is ongoing
      const timeRemaining = Math.max(0, Math.floor((warData.end - currentTime) / 1000));
      description += `**War is ACTIVE!**\n`;
      description += `**Time Remaining:** ${formatTimeRemaining(timeRemaining)}\n`;
      description += `**End Time:** ${formatDate(new Date(warData.end))}\n`;
      
      if (warData.score && warData.score !== 'N/A') {
        description += `**Current Score:** ${warData.score}\n`;
      }
      
      const progressPercent = Math.min(100, Math.max(0, 
        Math.floor(((currentTime - warData.start) / (warData.end - warData.start)) * 100)
      ));
      
      const progressBar = createProgressBar(progressPercent, 20);
      description += `\n**War Progress:** ${progressPercent}%\n${progressBar}`;
      
      embed.setColor(Colors.Red); // Red for active
    } else if (warData.end && warData.end <= currentTime) {
      // War has ended
      description += `**War has ENDED!**\n`;
      
      if (warData.score && warData.score !== 'N/A') {
        description += `**Final Score:** ${warData.score}\n`;
      }
      
      embed.setColor(Colors.Grey); // Grey for ended
    }
    
    embed.setDescription(description);
    
    // Add fields
    embed.addFields(
      { name: 'War Type', value: warData.type, inline: true },
      { name: 'Opponent', value: warData.opponent, inline: true },
      { name: 'Status', value: getStatusText(warData, currentTime), inline: true }
    );
    
    return embed;
  } catch (error) {
    logError('Error creating war countdown embed:', error);
    
    // Return a basic embed in case of error
    return new EmbedBuilder()
      .setTitle('⚔️ War Countdown')
      .setDescription('Error creating war countdown embed. Please try again later.')
      .setColor(Colors.Red)
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
  }
}

/**
 * Get status text for war
 * @param {Object} warData - War data
 * @param {number} currentTime - Current timestamp
 * @returns {string} Status text
 */
function getStatusText(warData, currentTime) {
  if (warData.start && warData.start > currentTime) {
    return '⏳ Upcoming';
  } else if (warData.start && warData.end && warData.end > currentTime) {
    return '⚔️ Active';
  } else if (warData.end && warData.end <= currentTime) {
    return '🏁 Completed';
  }
  return '❓ Unknown';
}

/**
 * Create a progress bar
 * @param {number} percent - Percentage complete
 * @param {number} length - Length of the progress bar
 * @returns {string} Progress bar
 */
function createProgressBar(percent, length) {
  const filledLength = Math.floor(length * (percent / 100));
  const emptyLength = length - filledLength;
  
  const filled = '█'.repeat(filledLength);
  const empty = '░'.repeat(emptyLength);
  
  return `|${filled}${empty}|`;
}

/**
 * Create or update countdown message for a war
 * @param {Client} client - Discord client
 * @param {string} serverId - Discord server ID
 * @param {Object} warData - War data
 */
async function createOrUpdateCountdown(client, serverId, warData) {
  try {
    const config = countdownConfigs[serverId];
    if (!config || !config.enabled || !config.channelId) return;
    
    // Get the channel
    const guild = await client.guilds.fetch(serverId).catch(() => null);
    if (!guild) return;
    
    const channel = await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    
    // Get faction name
    const factionName = client.tornData?.faction?.name || 'Your Faction';
    
    // Create the embed
    const embed = createWarCountdownEmbed(warData, factionName, Date.now());
    
    // Create action row with refresh button
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('warcountdown_refresh')
          .setLabel('Refresh Countdown')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔄')
      );
    
    // Check if we have an active countdown for this server
    if (activeCountdowns[serverId]) {
      try {
        // Update existing message
        const messageRef = activeCountdowns[serverId];
        const message = await channel.messages.fetch(messageRef.messageId).catch(() => null);
        
        if (message) {
          await message.edit({ embeds: [embed], components: [actionRow] }).catch(error => {
            logError(`Error updating war countdown message for ${serverId}:`, error);
          });
          return;
        }
      } catch (error) {
        logError(`Error fetching active countdown message for ${serverId}:`, error);
        // Fall through to create a new message
      }
    }
    
    // Create new message
    const message = await channel.send({ embeds: [embed], components: [actionRow] });
    
    // Store the message reference
    activeCountdowns[serverId] = {
      messageId: message.id,
      channelId: channel.id,
      warData: warData
    };
    
    log(`Created war countdown for server ${serverId}`);
    
    // Set up interval to update the countdown
    if (activeMessageUpdaters[serverId]) {
      clearInterval(activeMessageUpdaters[serverId]);
    }
    
    // Only set up auto-updater if the war is upcoming or active
    if ((warData.start && warData.start > Date.now()) || 
        (warData.end && warData.end > Date.now())) {
      activeMessageUpdaters[serverId] = setInterval(async () => {
        try {
          // Get the latest message
          const newMessage = await channel.messages.fetch(message.id).catch(() => null);
          if (!newMessage) {
            clearInterval(activeMessageUpdaters[serverId]);
            delete activeMessageUpdaters[serverId];
            return;
          }
          
          // Update the embed with current time
          const updatedEmbed = createWarCountdownEmbed(warData, factionName, Date.now());
          await newMessage.edit({ embeds: [updatedEmbed], components: [actionRow] }).catch(() => {
            clearInterval(activeMessageUpdaters[serverId]);
            delete activeMessageUpdaters[serverId];
          });
          
          // Stop the updater if the war has ended
          if (warData.end && warData.end <= Date.now()) {
            clearInterval(activeMessageUpdaters[serverId]);
            delete activeMessageUpdaters[serverId];
            log(`War countdown completed for server ${serverId}`);
          }
        } catch (error) {
          logError(`Error in countdown updater for ${serverId}:`, error);
          clearInterval(activeMessageUpdaters[serverId]);
          delete activeMessageUpdaters[serverId];
        }
      }, COUNTDOWN_UPDATE_INTERVAL);
    }
  } catch (error) {
    logError(`Error creating war countdown for ${serverId}:`, error);
  }
}

/**
 * Handle refresh button click
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 */
async function handleRefreshButton(interaction, client) {
  try {
    await interaction.deferUpdate();
    
    const serverId = interaction.guildId;
    if (!activeCountdowns[serverId]) {
      return interaction.followUp({
        content: '❌ No active war countdown found.',
        ephemeral: true
      });
    }
    
    // Get faction name
    const factionName = client.tornData?.faction?.name || 'Your Faction';
    
    // Get the war data
    const warData = activeCountdowns[serverId].warData;
    
    // Update the embed
    const embed = createWarCountdownEmbed(warData, factionName, Date.now());
    
    // Create action row with refresh button
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('warcountdown_refresh')
          .setLabel('Refresh Countdown')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔄')
      );
    
    // Update the message
    await interaction.editReply({ embeds: [embed], components: [actionRow] });
    
  } catch (error) {
    logError('Error handling war countdown refresh:', error);
    
    try {
      await interaction.followUp({
        content: '❌ Error refreshing war countdown.',
        ephemeral: true
      });
    } catch {
      // Ignore if we can't follow up
    }
  }
}

/**
 * Check for wars and update countdowns
 * @param {Client} client - Discord client
 */
async function checkWarsAndUpdateCountdowns(client) {
  try {
    if (!client || !client.tornData || !client.tornData.faction) {
      return;
    }
    
    // Check if there's an ongoing or upcoming war
    const warData = checkForWar(client.tornData.faction);
    
    if (!warData) {
      // No war found, clear any existing countdowns
      for (const serverId in activeCountdowns) {
        clearActiveCountdown(serverId);
      }
      return;
    }
    
    // Update countdowns for all configured servers
    for (const serverId in countdownConfigs) {
      if (countdownConfigs[serverId].enabled) {
        createOrUpdateCountdown(client, serverId, warData);
      }
    }
  } catch (error) {
    logError('Error checking wars and updating countdowns:', error);
  }
}

/**
 * Initialize the war countdown service
 * @param {Client} client - Discord client
 */
function initWarCountdownService(client) {
  if (!client) return;
  
  // Check for wars immediately
  checkWarsAndUpdateCountdowns(client);
  
  // Set up interval to check for wars
  setInterval(() => {
    checkWarsAndUpdateCountdowns(client);
  }, WAR_CHECK_INTERVAL);
  
  log('War countdown service initialized');
}

module.exports = {
  getCountdownConfig,
  setCountdownConfig,
  clearActiveCountdown,
  handleRefreshButton,
  checkWarsAndUpdateCountdowns,
  initWarCountdownService
};
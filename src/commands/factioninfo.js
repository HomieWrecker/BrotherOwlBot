const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatNumber, formatDate, formatTimeAgo } = require('../utils/formatting');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const keyStorageService = require('../services/key-storage-service');
const statTrackerService = require('../services/stat-tracker-service');

// Faction information command
const factionInfoCommand = {
  data: new SlashCommandBuilder()
    .setName('factioninfo')
    .setDescription('View detailed information about your faction members'),
  
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
      
      // Fetch faction data from Torn API
      const factionData = await fetchFactionData(apiKey);
      
      if (!factionData || factionData.error) {
        return interaction.editReply({
          content: `❌ Error fetching faction data: ${factionData?.error || 'Unknown error'}`
        });
      }
      
      // Check if user is in a faction
      if (!factionData.ID) {
        return interaction.editReply({
          content: '❌ You don\'t appear to be in a faction, or your API key doesn\'t have access to faction data.'
        });
      }
      
      // Store the current faction data for future use
      await statTrackerService.storeFactionInfo(factionData.ID, factionData);
      
      // Create the initial status embed showing online/offline members
      const statusEmbed = createStatusEmbed(factionData);
      
      // Create buttons for different views
      const buttonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('factioninfo_status')
            .setLabel('Online Status')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('factioninfo_xanax')
            .setLabel('Xanax Usage')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('factioninfo_energy')
            .setLabel('Energy Stats')
            .setStyle(ButtonStyle.Secondary)
        );
      
      await interaction.editReply({ 
        embeds: [statusEmbed],
        components: [buttonRow]
      });
      
    } catch (error) {
      logError('Error executing factioninfo command:', error);
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ There was an error fetching faction information. Please try again later.'
        });
      } else {
        await interaction.reply({
          content: '❌ There was an error fetching faction information. Please try again later.',
          ephemeral: true
        });
      }
    }
  },
  
  /**
   * Handle button interactions
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    try {
      // Extract faction ID from the button custom ID
      const buttonId = interaction.customId;
      
      // Get user's API key
      const apiKey = await keyStorageService.getApiKey(interaction.user.id, 'torn');
      
      if (!apiKey) {
        return interaction.reply({
          content: '❌ You need to set your API key first with `/apikey`',
          ephemeral: true
        });
      }
      
      await interaction.deferUpdate();
      
      // Fetch the most recent faction data from our database
      let factionData;
      
      // Determine which faction the user is in
      const userData = await fetchUserFaction(apiKey);
      if (userData.error) {
        return interaction.editReply({
          content: `❌ Error fetching user data: ${userData.error}`
        });
      }
      
      if (!userData.faction || !userData.faction.faction_id) {
        return interaction.editReply({
          content: '❌ You don\'t appear to be in a faction, or your API key doesn\'t have access to faction data.'
        });
      }
      
      const factionId = userData.faction.faction_id;
      
      // Get faction data from database or Torn API
      factionData = await statTrackerService.getFactionInfo(factionId);
      
      // If not in database or data is old, fetch fresh data
      if (!factionData || isDataStale(factionData.last_updated)) {
        factionData = await fetchFactionData(apiKey);
        
        if (!factionData || factionData.error) {
          return interaction.editReply({
            content: `❌ Error fetching faction data: ${factionData?.error || 'Unknown error'}`
          });
        }
        
        // Store updated data
        await statTrackerService.storeFactionInfo(factionData.ID, factionData);
      }
      
      let embed;
      
      // Show different embeds based on the button clicked
      if (buttonId === 'factioninfo_status') {
        embed = createStatusEmbed(factionData);
      } else if (buttonId === 'factioninfo_xanax') {
        embed = createXanaxEmbed(factionData);
      } else if (buttonId === 'factioninfo_energy') {
        embed = createEnergyEmbed(factionData);
      }
      
      // Create buttons for different views
      const buttonRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('factioninfo_status')
            .setLabel('Online Status')
            .setStyle(buttonId === 'factioninfo_status' ? ButtonStyle.Primary : ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('factioninfo_xanax')
            .setLabel('Xanax Usage')
            .setStyle(buttonId === 'factioninfo_xanax' ? ButtonStyle.Primary : ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('factioninfo_energy')
            .setLabel('Energy Stats')
            .setStyle(buttonId === 'factioninfo_energy' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );
      
      await interaction.editReply({ 
        embeds: [embed],
        components: [buttonRow]
      });
      
    } catch (error) {
      logError('Error handling factioninfo button:', error);
      await interaction.editReply({
        content: '❌ There was an error processing your request. Please try again later.'
      });
    }
  }
};

/**
 * Fetch faction data from Torn API
 * @param {string} apiKey - Torn API key
 * @returns {Promise<Object>} Faction data
 */
async function fetchFactionData(apiKey) {
  try {
    // First, get the user's faction ID
    const userData = await fetchUserFaction(apiKey);
    
    if (userData.error) {
      return { error: userData.error };
    }
    
    if (!userData.faction || !userData.faction.faction_id) {
      return { error: 'Not in a faction' };
    }
    
    const factionId = userData.faction.faction_id;
    
    // Then fetch detailed faction data
    const url = `https://api.torn.com/faction/${factionId}?selections=basic,stats,crimes,attacks,armor,temporary,donations,upgrades,members&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      return { error: data.error.error };
    }
    
    return data;
  } catch (error) {
    logError('Error fetching faction data from Torn API:', error);
    return { error: 'Failed to fetch data from Torn API' };
  }
}

/**
 * Fetch user's faction information
 * @param {string} apiKey - Torn API key
 * @returns {Promise<Object>} User data with faction info
 */
async function fetchUserFaction(apiKey) {
  try {
    const url = `https://api.torn.com/user/?selections=basic&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      return { error: data.error.error };
    }
    
    return data;
  } catch (error) {
    logError('Error fetching user data from Torn API:', error);
    return { error: 'Failed to fetch user data from Torn API' };
  }
}

/**
 * Check if data is stale (older than 15 minutes)
 * @param {string} timestamp - ISO timestamp string
 * @returns {boolean} Whether the data is stale
 */
function isDataStale(timestamp) {
  if (!timestamp) return true;
  
  const lastUpdated = new Date(timestamp);
  const now = new Date();
  const diffInMinutes = (now - lastUpdated) / (1000 * 60);
  
  return diffInMinutes > 15; // Stale if older than 15 minutes
}

/**
 * Create faction status embed showing online/offline members
 * @param {Object} factionData - Faction data from API
 * @returns {EmbedBuilder} Status embed
 */
function createStatusEmbed(factionData) {
  const embed = new EmbedBuilder()
    .setTitle(`${factionData.name} [${factionData.ID}] - Member Status`)
    .setColor(BOT_CONFIG.color)
    .setTimestamp();
  
  // Sort members by online status and position
  const members = Object.values(factionData.members || {});
  members.sort((a, b) => {
    // First by online status (online first)
    if (a.last_action.status !== b.last_action.status) {
      return a.last_action.status === 'Online' ? -1 : 1;
    }
    
    // Then by position (leader first)
    if (a.position !== b.position) {
      return getPositionRank(a.position) - getPositionRank(b.position);
    }
    
    // Then by last action (most recent first if offline)
    if (a.last_action.status === 'Offline' && b.last_action.status === 'Offline') {
      const aTimestamp = new Date(a.last_action.timestamp * 1000);
      const bTimestamp = new Date(b.last_action.timestamp * 1000);
      return bTimestamp - aTimestamp;
    }
    
    // Then by name
    return a.name.localeCompare(b.name);
  });
  
  // Add online members first
  const onlineMembers = members.filter(m => m.last_action.status === 'Online');
  if (onlineMembers.length > 0) {
    const onlineText = onlineMembers.map(m => 
      `**${m.name}** (${m.position})`
    ).join('\n');
    
    embed.addFields({
      name: `Online Members (${onlineMembers.length})`,
      value: onlineText || 'None'
    });
  }
  
  // Add offline members
  const offlineMembers = members.filter(m => m.last_action.status !== 'Online');
  if (offlineMembers.length > 0) {
    // Split offline members into chunks if there are too many
    const CHUNK_SIZE = 15; // Discord embed field limit is about 1024 chars
    const chunks = [];
    
    for (let i = 0; i < offlineMembers.length; i += CHUNK_SIZE) {
      chunks.push(offlineMembers.slice(i, i + CHUNK_SIZE));
    }
    
    chunks.forEach((chunk, index) => {
      const offlineText = chunk.map(m => {
        const lastActionTimestamp = new Date(m.last_action.timestamp * 1000);
        const timeAgo = formatTimeAgo(lastActionTimestamp);
        return `**${m.name}** (${m.position}) - ${timeAgo} ago`;
      }).join('\n');
      
      embed.addFields({
        name: index === 0 ? `Offline Members (${offlineMembers.length})` : '\u200B',
        value: offlineText || 'None'
      });
    });
  }
  
  embed.setFooter({
    text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Total Members: ${members.length}`
  });
  
  return embed;
}

/**
 * Create xanax usage embed showing members' daily xanax usage
 * @param {Object} factionData - Faction data from API
 * @returns {EmbedBuilder} Xanax usage embed
 */
function createXanaxEmbed(factionData) {
  const embed = new EmbedBuilder()
    .setTitle(`${factionData.name} [${factionData.ID}] - Xanax Usage`)
    .setColor(BOT_CONFIG.color)
    .setTimestamp();
  
  // Sort members by xanax usage and position
  const members = Object.values(factionData.members || {});
  
  // Ensure members have personalstats with xantaken
  members.forEach(member => {
    if (!member.personalstats) {
      member.personalstats = { xantaken: 0 };
    } else if (member.personalstats.xantaken === undefined) {
      member.personalstats.xantaken = 0;
    }
  });
  
  members.sort((a, b) => {
    // Sort by xanax taken (highest first)
    if ((a.personalstats?.xantaken || 0) !== (b.personalstats?.xantaken || 0)) {
      return (b.personalstats?.xantaken || 0) - (a.personalstats?.xantaken || 0);
    }
    
    // Then by position
    if (a.position !== b.position) {
      return getPositionRank(a.position) - getPositionRank(b.position);
    }
    
    // Then by name
    return a.name.localeCompare(b.name);
  });
  
  // Split members into chunks if there are too many
  const CHUNK_SIZE = 15; // Discord embed field limit is about 1024 chars
  const chunks = [];
  
  for (let i = 0; i < members.length; i += CHUNK_SIZE) {
    chunks.push(members.slice(i, i + CHUNK_SIZE));
  }
  
  chunks.forEach((chunk, index) => {
    const xanaxText = chunk.map(m => {
      const xanaxCount = m.personalstats?.xantaken || 0;
      return `**${m.name}** (${m.position}) - ${formatNumber(xanaxCount)} xanax`;
    }).join('\n');
    
    embed.addFields({
      name: index === 0 ? `Xanax Usage (Members: ${members.length})` : '\u200B',
      value: xanaxText || 'No data available'
    });
  });
  
  embed.setFooter({
    text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Note: This shows lifetime xanax usage`
  });
  
  return embed;
}

/**
 * Create energy stats embed showing members' energy usage and current energy
 * @param {Object} factionData - Faction data from API
 * @returns {EmbedBuilder} Energy stats embed
 */
function createEnergyEmbed(factionData) {
  const embed = new EmbedBuilder()
    .setTitle(`${factionData.name} [${factionData.ID}] - Energy Stats`)
    .setColor(BOT_CONFIG.color)
    .setTimestamp();
  
  // Sort members by energy used and position
  const members = Object.values(factionData.members || {});
  
  // Ensure members have personalstats with energy
  members.forEach(member => {
    if (!member.personalstats) {
      member.personalstats = { energy: 0 };
    } else if (member.personalstats.energy === undefined) {
      member.personalstats.energy = 0;
    }
  });
  
  members.sort((a, b) => {
    // Sort by energy used (highest first)
    if ((a.personalstats?.energy || 0) !== (b.personalstats?.energy || 0)) {
      return (b.personalstats?.energy || 0) - (a.personalstats?.energy || 0);
    }
    
    // Then by position
    if (a.position !== b.position) {
      return getPositionRank(a.position) - getPositionRank(b.position);
    }
    
    // Then by name
    return a.name.localeCompare(b.name);
  });
  
  // Split members into chunks if there are too many
  const CHUNK_SIZE = 15; // Discord embed field limit is about 1024 chars
  const chunks = [];
  
  for (let i = 0; i < members.length; i += CHUNK_SIZE) {
    chunks.push(members.slice(i, i + CHUNK_SIZE));
  }
  
  chunks.forEach((chunk, index) => {
    const energyText = chunk.map(m => {
      const energyUsed = m.personalstats?.energy || 0;
      const currentEnergy = m.energy?.current || 0;
      const maxEnergy = m.energy?.maximum || 0;
      return `**${m.name}** (${m.position}) - Used: ${formatNumber(energyUsed)} | Current: ${currentEnergy}/${maxEnergy}`;
    }).join('\n');
    
    embed.addFields({
      name: index === 0 ? `Energy Stats (Members: ${members.length})` : '\u200B',
      value: energyText || 'No data available'
    });
  });
  
  embed.setFooter({
    text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Note: Energy used is lifetime total`
  });
  
  return embed;
}

/**
 * Get numeric rank for a faction position for sorting
 * @param {string} position - Faction position name
 * @returns {number} Position rank (lower is higher rank)
 */
function getPositionRank(position) {
  const positionRanks = {
    'Leader': 1,
    'Co-leader': 2,
    'Advisor': 3,
    'Officer': 4,
    'Secretary': 5,
    'Treasurer': 6,
    'Recruiter': 7,
    'Member': 8
  };
  
  return positionRanks[position] || 999;
}

module.exports = factionInfoCommand;
/**
 * War Pay command for BrotherOwlManager
 * Tracks member contributions and calculates payment distribution for wars and chains
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, MessageButton, MessageSelectMenu } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatNumber, formatTime } = require('../utils/formatting');
const { getUserApiKey } = require('./apikey');
const warPayService = require('../services/warpay-service');

// Isolated error handling to prevent disrupting the bot
async function safeExecute(callback) {
  try {
    return await callback();
  } catch (error) {
    logError('Error in warpay command:', error);
    return {
      error: true,
      message: `Error: ${error.message || 'Unknown error occurred'}`
    };
  }
}

const warpayCommand = {
  data: new SlashCommandBuilder()
    .setName('warpay')
    .setDescription('Track and calculate war contributions and payment distribution')
    .addSubcommand(subcommand =>
      subcommand
        .setName('track')
        .setDescription('Start tracking a new war or chain')
        .addStringOption(option =>
          option.setName('war_id')
            .setDescription('War ID to track (leave empty for general chain tracking)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('enemy_only')
            .setDescription('Only track hits on enemy faction (for wars)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Update contribution data from the API')
        .addStringOption(option =>
          option.setName('tracking_id')
            .setDescription('War ID or "current" for ongoing tracking')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View contribution statistics')
        .addStringOption(option =>
          option.setName('tracking_id')
            .setDescription('War ID or "current" for ongoing tracking')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('calculate')
        .setDescription('Calculate payment distribution based on contributions')
        .addStringOption(option =>
          option.setName('tracking_id')
            .setDescription('War ID or "current" for ongoing tracking')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Total amount to distribute')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('percentage')
            .setDescription('Percentage of the total to distribute to members (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100))
        .addStringOption(option =>
          option.setName('contribution_type')
            .setDescription('Type of contributions to consider')
            .setRequired(true)
            .addChoices(
              { name: 'Enemy faction hits only', value: 'enemy' },
              { name: 'Other hits only', value: 'other' },
              { name: 'Both types of hits', value: 'both' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset tracking data')
        .addStringOption(option =>
          option.setName('tracking_id')
            .setDescription('War ID or "current" for ongoing tracking')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all tracking sessions')),
    
  /**
   * Execute command with safe error handling
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    const result = await safeExecute(async () => {
      // Defer reply as this might take a bit
      await interaction.deferReply();
      
      // Get API key
      const apiKey = getUserApiKey(interaction.user.id);
      if (!apiKey) {
        return {
          error: true,
          message: 'You need to set your API key first using `/apikey`'
        };
      }
      
      // Process subcommands
      const subcommand = interaction.options.getSubcommand();
      
      switch (subcommand) {
        case 'track':
          return await handleTrackSubcommand(interaction, apiKey);
        case 'update':
          return await handleUpdateSubcommand(interaction, apiKey);
        case 'view':
          return await handleViewSubcommand(interaction, apiKey);
        case 'calculate':
          return await handleCalculateSubcommand(interaction, apiKey);
        case 'reset':
          return await handleResetSubcommand(interaction, apiKey);
        case 'list':
          return await handleListSubcommand(interaction, apiKey);
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
      // Get API key
      const apiKey = getUserApiKey(interaction.user.id);
      if (!apiKey) {
        return {
          error: true,
          message: 'You need to set your API key first using `/apikey`'
        };
      }
      
      const customId = interaction.customId;
      
      // Confirm reset button
      if (customId.startsWith('warpay_reset_confirm_')) {
        const trackingId = customId.replace('warpay_reset_confirm_', '');
        await interaction.deferUpdate();
        
        // Reset tracking data
        await warPayService.resetTracking(trackingId);
        
        return {
          content: `✅ Tracking for ${trackingId === 'current' ? 'ongoing tracking' : `war ${trackingId}`} has been reset.`
        };
      }
      
      // Cancel reset button
      if (customId.startsWith('warpay_reset_cancel_')) {
        return {
          content: '❌ Reset cancelled.'
        };
      }
      
      // Update data button
      if (customId.startsWith('warpay_update_')) {
        const trackingId = customId.replace('warpay_update_', '');
        await interaction.deferUpdate();
        
        // Get tracking details to check if it's a war or ongoing tracking
        const isWar = trackingId !== 'current';
        
        // Update tracking data
        await warPayService.fetchWarContributions(
          apiKey,
          null, // Get faction ID from API key
          isWar ? trackingId : null, 
          true // Track enemy only for wars by default
        );
        
        // Get updated tracking data
        const trackingData = warPayService.getTrackingDetails(trackingId);
        
        // Generate embed for the updated data
        const embed = generateContributionEmbed(trackingData, trackingId);
        
        // Generate components
        const components = generateContributionComponents(trackingId);
        
        return {
          embeds: [embed],
          components
        };
      }
      
      return null;
    });
    
    if (result === null) {
      return;
    }
    
    if (result.error) {
      await interaction.update({ content: result.message, embeds: [], components: [] });
      return;
    }
    
    if (result.embeds) {
      await interaction.update({
        content: result.content || null,
        embeds: result.embeds,
        components: result.components || []
      });
    } else {
      await interaction.update({ content: result.content, embeds: [], components: [] });
    }
  }
};

/**
 * Handle the track subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - API key
 * @returns {Object} Command result
 */
async function handleTrackSubcommand(interaction, apiKey) {
  const warId = interaction.options.getString('war_id');
  const enemyOnly = interaction.options.getBoolean('enemy_only') ?? true;
  
  // Start a new tracking session
  warPayService.startNewTracking(warId);
  
  // Fetch initial data
  await warPayService.fetchWarContributions(apiKey, null, warId, enemyOnly);
  
  // Get tracking data
  const trackingData = warPayService.getTrackingDetails(warId || 'current');
  
  return {
    content: `✅ Started ${warId ? `tracking for war ${warId}` : 'general chain tracking'}.`,
    embeds: [generateContributionEmbed(trackingData, warId || 'current')],
    components: generateContributionComponents(warId || 'current')
  };
}

/**
 * Handle the update subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - API key
 * @returns {Object} Command result
 */
async function handleUpdateSubcommand(interaction, apiKey) {
  const trackingId = interaction.options.getString('tracking_id');
  
  // Check if tracking exists
  try {
    const isWar = trackingId !== 'current';
    const trackingData = warPayService.getTrackingDetails(trackingId);
    
    // Update tracking data
    await warPayService.fetchWarContributions(
      apiKey,
      null, // Get faction ID from API key
      isWar ? trackingId : null, 
      true // Track enemy only for wars by default
    );
    
    // Get updated tracking data
    const updatedData = warPayService.getTrackingDetails(trackingId);
    
    return {
      content: `✅ Updated ${isWar ? `war ${trackingId}` : 'ongoing'} tracking data.`,
      embeds: [generateContributionEmbed(updatedData, trackingId)],
      components: generateContributionComponents(trackingId)
    };
  } catch (error) {
    return {
      error: true,
      message: `No tracking found for ${trackingId === 'current' ? 'ongoing tracking' : `war ${trackingId}`}. Start tracking with \`/warpay track\`.`
    };
  }
}

/**
 * Handle the view subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - API key
 * @returns {Object} Command result
 */
async function handleViewSubcommand(interaction, apiKey) {
  const trackingId = interaction.options.getString('tracking_id');
  
  // Check if tracking exists
  try {
    const trackingData = warPayService.getTrackingDetails(trackingId);
    
    return {
      embeds: [generateContributionEmbed(trackingData, trackingId)],
      components: generateContributionComponents(trackingId)
    };
  } catch (error) {
    return {
      error: true,
      message: `No tracking found for ${trackingId === 'current' ? 'ongoing tracking' : `war ${trackingId}`}. Start tracking with \`/warpay track\`.`
    };
  }
}

/**
 * Handle the calculate subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - API key
 * @returns {Object} Command result
 */
async function handleCalculateSubcommand(interaction, apiKey) {
  const trackingId = interaction.options.getString('tracking_id');
  const amount = interaction.options.getInteger('amount');
  const percentage = interaction.options.getInteger('percentage');
  const contributionType = interaction.options.getString('contribution_type');
  
  // Check if tracking exists
  try {
    // Calculate payments
    const paymentData = warPayService.calculatePayments(trackingId, amount, percentage, contributionType);
    
    // Generate payment embeds
    const embeds = generatePaymentEmbeds(paymentData, trackingId);
    
    return {
      embeds,
      components: []
    };
  } catch (error) {
    return {
      error: true,
      message: `Error calculating payments: ${error.message}`
    };
  }
}

/**
 * Handle the reset subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - API key
 * @returns {Object} Command result
 */
async function handleResetSubcommand(interaction, apiKey) {
  const trackingId = interaction.options.getString('tracking_id');
  
  // Check if tracking exists
  try {
    warPayService.getTrackingDetails(trackingId);
    
    // Create confirmation buttons
    const components = [
      new MessageActionRow().addComponents(
        new MessageButton()
          .setCustomId(`warpay_reset_confirm_${trackingId}`)
          .setLabel('Confirm Reset')
          .setStyle('DANGER'),
        new MessageButton()
          .setCustomId(`warpay_reset_cancel_${trackingId}`)
          .setLabel('Cancel')
          .setStyle('SECONDARY')
      )
    ];
    
    return {
      content: `⚠️ Are you sure you want to reset tracking data for ${trackingId === 'current' ? 'ongoing tracking' : `war ${trackingId}`}? This cannot be undone!`,
      components
    };
  } catch (error) {
    return {
      error: true,
      message: `No tracking found for ${trackingId === 'current' ? 'ongoing tracking' : `war ${trackingId}`}.`
    };
  }
}

/**
 * Handle the list subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - API key
 * @returns {Object} Command result
 */
async function handleListSubcommand(interaction, apiKey) {
  // Get all tracking sessions
  const sessions = warPayService.getTrackingSessions();
  
  // Generate embed
  const embed = new MessageEmbed()
    .setTitle('War Pay Tracking Sessions')
    .setColor(0x3498db)
    .setDescription('List of all tracking sessions')
    .setTimestamp();
  
  // Add ongoing tracking if it exists
  if (sessions.ongoing) {
    const startDate = new Date(sessions.ongoing.startTime);
    const lastUpdateDate = new Date(sessions.ongoing.lastUpdate);
    
    embed.addField(
      'Ongoing Tracking',
      `Started: ${startDate.toLocaleString()}\n` +
      `Last Update: ${lastUpdateDate.toLocaleString()}\n` +
      `Total Hits: ${sessions.ongoing.totalHits}\n` +
      `ID: \`current\``
    );
  } else {
    embed.addField('Ongoing Tracking', 'No active ongoing tracking');
  }
  
  // Add war tracking sessions
  if (sessions.wars.length > 0) {
    sessions.wars.forEach(war => {
      const startDate = new Date(war.startTime);
      const lastUpdateDate = new Date(war.lastUpdate);
      
      embed.addField(
        `War ${war.id}`,
        `Started: ${startDate.toLocaleString()}\n` +
        `Last Update: ${lastUpdateDate.toLocaleString()}\n` +
        `Total Hits: ${war.totalHits}\n` +
        `ID: \`${war.id}\``
      );
    });
  } else {
    embed.addField('War Tracking', 'No war tracking sessions');
  }
  
  embed.setFooter({ text: 'Use the tracking IDs with other warpay commands' });
  
  return {
    embeds: [embed]
  };
}

/**
 * Generate an embed for contribution data
 * @param {Object} trackingData - Tracking data
 * @param {string} trackingId - Tracking ID
 * @returns {MessageEmbed} Discord embed
 */
function generateContributionEmbed(trackingData, trackingId) {
  const embed = new MessageEmbed()
    .setTitle(`War Pay Contributions - ${trackingId === 'current' ? 'Ongoing Tracking' : `War ${trackingId}`}`)
    .setColor(0x3498db)
    .setTimestamp();
  
  // Add tracking stats
  const startDate = new Date(trackingData.startTime);
  const lastUpdateDate = new Date(trackingData.lastUpdate);
  
  embed.addField(
    'Tracking Statistics',
    `Started: ${startDate.toLocaleString()}\n` +
    `Last Update: ${lastUpdateDate.toLocaleString()}\n` +
    `Enemy Hits: ${trackingData.enemyHits}\n` +
    `Other Hits: ${trackingData.otherHits}\n` +
    `Total Hits: ${trackingData.totalHits}`
  );
  
  // Sort members by total hits
  const sortedMembers = Object.entries(trackingData.memberContributions)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.totalHits - a.totalHits);
  
  // Add top contributors
  const topContributors = sortedMembers.slice(0, 10);
  
  if (topContributors.length > 0) {
    let contributorsText = '';
    
    topContributors.forEach((member, index) => {
      const lastActionDate = new Date(member.lastAttack * 1000);
      contributorsText += `${index + 1}. **${member.name}** - Enemy: ${member.enemyHits}, Other: ${member.otherHits}, Total: ${member.totalHits}\n`;
    });
    
    embed.addField('Top Contributors', contributorsText);
  } else {
    embed.addField('Contributors', 'No contributions recorded yet');
  }
  
  embed.setFooter({ text: `Total members contributing: ${Object.keys(trackingData.memberContributions).length}` });
  
  return embed;
}

/**
 * Generate components for contribution data
 * @param {string} trackingId - Tracking ID
 * @returns {Array} Discord message components
 */
function generateContributionComponents(trackingId) {
  return [
    new MessageActionRow().addComponents(
      new MessageButton()
        .setCustomId(`warpay_update_${trackingId}`)
        .setLabel('Update Data')
        .setStyle('PRIMARY')
        .setEmoji('🔄')
    )
  ];
}

/**
 * Generate embeds for payment data
 * @param {Object} paymentData - Payment data
 * @param {string} trackingId - Tracking ID
 * @returns {Array} Discord embeds
 */
function generatePaymentEmbeds(paymentData, trackingId) {
  const embeds = [];
  
  // Create main embed with payment summary
  const mainEmbed = new MessageEmbed()
    .setTitle(`War Pay Distribution - ${trackingId === 'current' ? 'Ongoing Tracking' : `War ${trackingId}`}`)
    .setColor(0x2ecc71)
    .setDescription('Payment distribution based on member contributions')
    .setTimestamp();
  
  // Add payment details
  const startDate = new Date(paymentData.startTime);
  const lastUpdateDate = new Date(paymentData.lastUpdate);
  
  mainEmbed.addField(
    'Payment Details',
    `Total Amount: ${formatNumber(paymentData.totalAmount)}\n` +
    `Distribution Amount: ${formatNumber(paymentData.distributionAmount)} (${(paymentData.distributionAmount / paymentData.totalAmount * 100).toFixed(2)}%)\n` +
    `Contribution Type: ${paymentData.contributionType === 'enemy' ? 'Enemy faction hits only' : 
                          paymentData.contributionType === 'other' ? 'Other hits only' : 
                          'Both types of hits'}\n` +
    `Total Contributions: ${paymentData.totalContribution}\n` +
    `Started: ${startDate.toLocaleString()}\n` +
    `Last Update: ${lastUpdateDate.toLocaleString()}`
  );
  
  // Sort members by payment amount
  const sortedMembers = Object.entries(paymentData.memberPayments)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.payment - a.payment);
  
  // Add payment details to the main embed (top 15)
  if (sortedMembers.length > 0) {
    let paymentsText = '';
    
    sortedMembers.slice(0, 15).forEach((member, index) => {
      paymentsText += `${index + 1}. **${member.name}** - ${formatNumber(Math.round(member.payment))} (${member.contributionPercentage.toFixed(2)}%)\n`;
    });
    
    mainEmbed.addField('Top Payments', paymentsText);
  } else {
    mainEmbed.addField('Payments', 'No members to pay');
  }
  
  mainEmbed.setFooter({ text: `Total members receiving payment: ${Object.keys(paymentData.memberPayments).length}` });
  
  embeds.push(mainEmbed);
  
  // If there are more than 15 members, create additional embeds
  if (sortedMembers.length > 15) {
    let currentEmbed = new MessageEmbed()
      .setTitle(`War Pay Distribution - Continued`)
      .setColor(0x2ecc71)
      .setTimestamp();
    
    let currentFieldIndex = 0;
    let currentFieldText = '';
    
    for (let i = 15; i < sortedMembers.length; i++) {
      const member = sortedMembers[i];
      const lineText = `${i + 1}. **${member.name}** - ${formatNumber(Math.round(member.payment))} (${member.contributionPercentage.toFixed(2)}%)\n`;
      
      // Check if adding this line would exceed Discord's field value limit
      if (currentFieldText.length + lineText.length > 1024) {
        // Add current field to embed
        currentEmbed.addField(`Payments (continued ${currentFieldIndex + 1})`, currentFieldText);
        currentFieldText = lineText;
        currentFieldIndex++;
        
        // Check if we need a new embed (Discord limits fields per embed)
        if (currentFieldIndex > 0 && currentFieldIndex % 25 === 0) {
          embeds.push(currentEmbed);
          currentEmbed = new MessageEmbed()
            .setTitle(`War Pay Distribution - Continued`)
            .setColor(0x2ecc71)
            .setTimestamp();
          currentFieldIndex = 0;
        }
      } else {
        currentFieldText += lineText;
      }
    }
    
    // Add any remaining text
    if (currentFieldText.length > 0) {
      currentEmbed.addField(`Payments (continued ${currentFieldIndex + 1})`, currentFieldText);
      embeds.push(currentEmbed);
    }
  }
  
  return embeds;
}module.exports = { warpayCommand };

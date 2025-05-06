/**
 * Faction Stats command for BrotherOwlManager
 * Provides tracking, viewing, and notification configuration for faction statistics
 */

const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  Colors, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ChannelType
} = require('discord.js');
const { log, logError } = require('../utils/logger');
const { 
  formatNumber, 
  formatDate,
  formatPercentChange,
  formatStatValue,
  formatCurrency,
  formatPeriod
} = require('../utils/formatting');
const { BOT_CONFIG } = require('../config');

// Command creation
const factionstatsCommand = {
  data: new SlashCommandBuilder()
    .setName('factionstats')
    .setDescription('Track and view faction statistics over time')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View faction statistics')
        .addStringOption(option =>
          option.setName('period')
            .setDescription('Time period to compare')
            .setRequired(false)
            .addChoices(
              { name: '24 Hours', value: 'day' },
              { name: '7 Days', value: 'week' },
              { name: '30 Days', value: 'month' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Configure faction stats notifications')
        .addChannelOption(option =>
          option.setName('notification_channel')
            .setDescription('Channel to send stat change notifications')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable or disable notifications')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check notification configuration status')),

  /**
   * Execute the slash command
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      switch (subcommand) {
        case 'view':
          await handleView(interaction, client);
          break;
        case 'setup':
          await handleSetup(interaction, client);
          break;
        case 'status':
          await handleStatus(interaction, client);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown subcommand.',
            ephemeral: true
          });
      }
    } catch (error) {
      logError(`Error executing factionstats command:`, error);
      
      // Handle errors in responding to the interaction
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ There was an error executing this command.',
          ephemeral: true
        }).catch(err => logError('Error sending followUp:', err));
      } else {
        await interaction.reply({
          content: '❌ There was an error executing this command.',
          ephemeral: true
        }).catch(err => logError('Error sending reply:', err));
      }
    }
  }
};

/**
 * Handle the view subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleView(interaction, client) {
  // Defer the reply since this might take a bit of time
  await interaction.deferReply();
  
  try {
    // Ensure we have Torn data
    if (!client.tornData || !client.tornData.faction) {
      return interaction.editReply({
        content: '❌ Unable to fetch faction data at this time. Please try again later.'
      });
    }
    
    // Get faction data
    const factionData = client.tornData.faction;
    const factionId = factionData.ID;
    const factionName = factionData.name;
    
    // Load the stats tracking service
    const statsTrackingService = require('../services/stats-tracking');
    
    // Get time period to compare
    const period = interaction.options.getString('period') || 'day';
    
    // Get stats comparison
    const comparison = statsTrackingService.getStatComparison(factionId, period);
    
    // If no comparison data is available, show current stats only
    if (!comparison) {
      const latestStats = statsTrackingService.getLatestStats(factionId);
      
      if (!latestStats) {
        // If no stats at all, update stats and inform user
        statsTrackingService.updateFactionStats(factionId, factionData);
        
        return interaction.editReply({
          content: `📊 Starting to track stats for faction **${factionName}** (ID: ${factionId}). Check back later for comparative statistics.`
        });
      }
      
      // Create embed with current stats only
      const embed = createCurrentStatsEmbed(factionId, factionName, latestStats);
      
      return interaction.editReply({ embeds: [embed] });
    }
    
    // Create embed with comparison stats
    const embed = createComparisonStatsEmbed(factionId, factionName, comparison, period);
    
    // Add refresh button
    const refreshButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`factionstats_refresh_${period}`)
          .setLabel(`Refresh ${formatPeriod(period)} Comparison`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔄')
      );
    
    return interaction.editReply({
      embeds: [embed],
      components: [refreshButton]
    });
    
  } catch (error) {
    logError('Error in handleView:', error);
    return interaction.editReply({
      content: '❌ An error occurred while retrieving faction statistics.'
    });
  }
}

/**
 * Handle the setup subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleSetup(interaction, client) {
  try {
    // Check for administrator permission
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ You need administrator permissions to configure faction stats notifications.',
        ephemeral: true
      });
    }
    
    // Get options
    const notificationChannel = interaction.options.getChannel('notification_channel');
    const enabled = interaction.options.getBoolean('enabled');
    
    // Ensure channel is a text channel
    if (notificationChannel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: '❌ Notification channel must be a text channel.',
        ephemeral: true
      });
    }
    
    // Ensure we have Torn data
    if (!client.tornData || !client.tornData.faction) {
      return interaction.reply({
        content: '❌ Unable to fetch faction data at this time. Please try again later.',
        ephemeral: true
      });
    }
    
    // Get faction data
    const factionData = client.tornData.faction;
    const factionId = factionData.ID;
    const factionName = factionData.name;
    
    // Load the stats tracking service
    const statsTrackingService = require('../services/stats-tracking');
    
    // Set configuration
    const config = {
      factionId,
      notificationChannelId: notificationChannel.id,
      enabled
    };
    
    statsTrackingService.setStatsConfig(interaction.guildId, config);
    
    // Create response embed
    const embed = new EmbedBuilder()
      .setTitle('Faction Stats Notifications Configuration')
      .setColor(enabled ? Colors.Green : Colors.Red)
      .setDescription(`Faction stats notifications for **${factionName}** have been ${enabled ? 'enabled' : 'disabled'}.`)
      .addFields(
        { name: 'Faction', value: `${factionName} (ID: ${factionId})`, inline: true },
        { name: 'Notification Channel', value: `<#${notificationChannel.id}>`, inline: true },
        { name: 'Status', value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Notification Frequency', value: 'Hourly checks, notifications sent when significant changes occur', inline: false }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in handleSetup:', error);
    return interaction.reply({
      content: '❌ An error occurred while configuring faction stats notifications.',
      ephemeral: true
    });
  }
}

/**
 * Handle the status subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleStatus(interaction, client) {
  try {
    // Load the stats tracking service
    const statsTrackingService = require('../services/stats-tracking');
    
    // Get configuration
    const config = statsTrackingService.getStatsConfig(interaction.guildId);
    
    if (!config) {
      return interaction.reply({
        content: '❌ Faction stats notifications are not configured on this server.',
        ephemeral: true
      });
    }
    
    // Get faction data if available
    let factionName = `Faction ${config.factionId}`;
    if (client.tornData && client.tornData.faction && client.tornData.faction.ID === config.factionId) {
      factionName = client.tornData.faction.name;
    }
    
    // Create response embed
    const embed = new EmbedBuilder()
      .setTitle('Faction Stats Notifications Status')
      .setColor(config.enabled ? Colors.Green : Colors.Red)
      .setDescription(`Current faction stats notification configuration:`)
      .addFields(
        { name: 'Faction', value: `${factionName} (ID: ${config.factionId})`, inline: true },
        { name: 'Notification Channel', value: `<#${config.notificationChannelId}>`, inline: true },
        { name: 'Status', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Notification Frequency', value: 'Hourly checks, notifications sent when significant changes occur', inline: false }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in handleStatus:', error);
    return interaction.reply({
      content: '❌ An error occurred while checking faction stats configuration.',
      ephemeral: true
    });
  }
}

/**
 * Create an embed for current stats without comparison
 * @param {string} factionId - Faction ID
 * @param {string} factionName - Faction name
 * @param {Object} statsEntry - Stats entry
 * @returns {EmbedBuilder} Stats embed
 */
function createCurrentStatsEmbed(factionId, factionName, statsEntry) {
  const embed = new EmbedBuilder()
    .setTitle(`📊 Faction Statistics: ${factionName}`)
    .setColor(Colors.Blue)
    .setDescription(`Current faction statistics as of ${formatDate(new Date(statsEntry.timestamp))}:`)
    .setTimestamp()
    .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Faction ID: ${factionId}` });
  
  // Group stats into categories
  const generalStats = [
    { name: 'Respect', value: formatNumber(statsEntry.stats.respect) },
    { name: 'Level', value: formatNumber(statsEntry.stats.level) },
    { name: 'Members', value: formatNumber(statsEntry.stats.members) },
    { name: 'Territories', value: formatNumber(statsEntry.stats.territory) }
  ];
  
  const combatStats = [
    { name: 'Attacks Won', value: formatNumber(statsEntry.stats.attack_won) },
    { name: 'Attacks Lost', value: formatNumber(statsEntry.stats.attack_lost) },
    { name: 'Defenses Won', value: formatNumber(statsEntry.stats.defense_won) },
    { name: 'Defenses Lost', value: formatNumber(statsEntry.stats.defense_lost) }
  ];
  
  const otherStats = [
    { name: 'Best Chain', value: formatNumber(statsEntry.stats.best_chain) },
    { name: 'Money Mugged', value: formatCurrency(statsEntry.stats.money_mugged) },
    { name: 'Revives', value: formatNumber(statsEntry.stats.revives) },
    { name: 'Items Used', value: formatNumber(statsEntry.stats.items_used) }
  ];
  
  // Add general stats
  embed.addFields({ name: 'General Statistics', value: ' ', inline: false });
  for (const stat of generalStats) {
    embed.addFields({ name: stat.name, value: stat.value, inline: true });
  }
  
  // Add combat stats
  embed.addFields({ name: 'Combat Statistics', value: ' ', inline: false });
  for (const stat of combatStats) {
    embed.addFields({ name: stat.name, value: stat.value, inline: true });
  }
  
  // Add other stats
  embed.addFields({ name: 'Other Statistics', value: ' ', inline: false });
  for (const stat of otherStats) {
    embed.addFields({ name: stat.name, value: stat.value, inline: true });
  }
  
  return embed;
}

/**
 * Create an embed for comparison stats
 * @param {string} factionId - Faction ID
 * @param {string} factionName - Faction name
 * @param {Object} comparison - Comparison data
 * @param {string} period - Time period
 * @returns {EmbedBuilder} Stats embed
 */
function createComparisonStatsEmbed(factionId, factionName, comparison, period) {
  const { current, previous, changes } = comparison;
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 Faction Statistics: ${factionName}`)
    .setColor(Colors.Blue)
    .setDescription(`Statistics comparison over the past ${formatPeriod(period)}:`)
    .setTimestamp()
    .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Faction ID: ${factionId}` });
  
  // Add time period information
  embed.addFields(
    { name: 'Current Time', value: formatDate(new Date(current.timestamp)), inline: true },
    { name: 'Previous Time', value: formatDate(new Date(previous.timestamp)), inline: true },
    { name: 'Period', value: formatPeriod(period), inline: true }
  );
  
  // Group stats into categories with their changes
  const generalStats = [
    { key: 'respect', name: 'Respect' },
    { key: 'level', name: 'Level' },
    { key: 'members', name: 'Members' },
    { key: 'territory', name: 'Territories' }
  ];
  
  const combatStats = [
    { key: 'attack_won', name: 'Attacks Won' },
    { key: 'attack_lost', name: 'Attacks Lost' },
    { key: 'defense_won', name: 'Defenses Won' },
    { key: 'defense_lost', name: 'Defenses Lost' }
  ];
  
  const otherStats = [
    { key: 'best_chain', name: 'Best Chain' },
    { key: 'money_mugged', name: 'Money Mugged' },
    { key: 'revives', name: 'Revives' },
    { key: 'items_used', name: 'Items Used' }
  ];
  
  // Add general stats with changes
  embed.addFields({ name: 'General Statistics', value: ' ', inline: false });
  for (const stat of generalStats) {
    if (current.stats[stat.key] !== undefined && previous.stats[stat.key] !== undefined && changes[stat.key]) {
      const currentValue = formatNumber(current.stats[stat.key]);
      const changeText = formatPercentChange(changes[stat.key].percent);
      embed.addFields({ name: stat.name, value: `${currentValue}\n${changeText}`, inline: true });
    } else {
      embed.addFields({ name: stat.name, value: formatNumber(current.stats[stat.key] || 0), inline: true });
    }
  }
  
  // Add combat stats with changes
  embed.addFields({ name: 'Combat Statistics', value: ' ', inline: false });
  for (const stat of combatStats) {
    if (current.stats[stat.key] !== undefined && previous.stats[stat.key] !== undefined && changes[stat.key]) {
      const currentValue = formatNumber(current.stats[stat.key]);
      const changeText = formatPercentChange(changes[stat.key].percent);
      embed.addFields({ name: stat.name, value: `${currentValue}\n${changeText}`, inline: true });
    } else {
      embed.addFields({ name: stat.name, value: formatNumber(current.stats[stat.key] || 0), inline: true });
    }
  }
  
  // Add other stats with changes
  embed.addFields({ name: 'Other Statistics', value: ' ', inline: false });
  for (const stat of otherStats) {
    if (current.stats[stat.key] !== undefined && previous.stats[stat.key] !== undefined && changes[stat.key]) {
      let currentValue;
      if (stat.key === 'money_mugged') {
        currentValue = formatCurrency(current.stats[stat.key]);
      } else {
        currentValue = formatNumber(current.stats[stat.key]);
      }
      const changeText = formatPercentChange(changes[stat.key].percent);
      embed.addFields({ name: stat.name, value: `${currentValue}\n${changeText}`, inline: true });
    } else {
      if (stat.key === 'money_mugged') {
        embed.addFields({ name: stat.name, value: formatCurrency(current.stats[stat.key] || 0), inline: true });
      } else {
        embed.addFields({ name: stat.name, value: formatNumber(current.stats[stat.key] || 0), inline: true });
      }
    }
  }
  
  return embed;
}

/**
 * Handle button interactions
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 */
async function handleButton(interaction, client) {
  try {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const period = parts[2];
    
    if (action === 'refresh') {
      await interaction.deferUpdate();
      
      // Ensure we have Torn data
      if (!client.tornData || !client.tornData.faction) {
        return interaction.editReply({
          content: '❌ Unable to fetch faction data at this time. Please try again later.',
          components: []
        });
      }
      
      // Get faction data
      const factionData = client.tornData.faction;
      const factionId = factionData.ID;
      const factionName = factionData.name;
      
      // Load the stats tracking service
      const statsTrackingService = require('../services/stats-tracking');
      
      // Update stats and get comparison
      statsTrackingService.updateFactionStats(factionId, factionData);
      const comparison = statsTrackingService.getStatComparison(factionId, period);
      
      if (!comparison) {
        return interaction.editReply({
          content: `❌ Not enough data available for a ${formatPeriod(period)} comparison yet.`,
          components: []
        });
      }
      
      // Create new embed
      const embed = createComparisonStatsEmbed(factionId, factionName, comparison, period);
      
      // Update refresh button
      const refreshButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`factionstats_refresh_${period}`)
            .setLabel(`Refresh ${formatPeriod(period)} Comparison`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄')
        );
      
      return interaction.editReply({
        embeds: [embed],
        components: [refreshButton]
      });
    }
  } catch (error) {
    logError('Error in factionstats handleButton:', error);
    
    return interaction.reply({
      content: '❌ An error occurred while refreshing faction statistics.',
      ephemeral: true
    });
  }
}

module.exports = { factionstatsCommand, handleButton };
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatTimeRemaining, formatNumber } = require('../utils/formatting');
const { BOT_CONFIG } = require('../config');
const { getServerConfig, hasRequiredConfig } = require('../services/server-config');

// Chain status command
const chainCommand = {
  data: new SlashCommandBuilder()
    .setName('chain')
    .setDescription('Show faction chain status'),
  
  async execute(interaction, client) {
    const { guildId } = interaction;
    
    // Check if faction config exists in this server
    if (hasRequiredConfig(guildId)) {
      // Use server-wide configuration
      const serverConfig = getServerConfig(guildId);
      const { factionId, factionApiKey, factionName } = serverConfig;
      await getChainStatus(interaction, client, factionId, factionApiKey, factionName);
    } else {
      // Use built-in data from the bot's TORN_API_KEY (existing behavior)
      if (!client.tornData || !client.tornData.chain) {
        return interaction.reply({
          content: '❌ No chain data available. Please try again later.',
          ephemeral: true
        });
      }
      
      await showChainEmbed(interaction, client.tornData.chain);
    }
  }
};

/**
 * Get chain status for a specific faction from API
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {string} factionId - Faction ID
 * @param {string} apiKey - API key
 * @param {string} factionName - Faction name
 */
async function getChainStatus(interaction, client, factionId, apiKey, factionName) {
  await interaction.deferReply();
  
  try {
    // Fetch chain data from API
    const response = await fetch(`https://api.torn.com/faction/${factionId}?selections=chain&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      return interaction.editReply(`❌ API Error: ${data.error.error}`);
    }
    
    // Format the chain data
    const chainData = data.chain || {};
    
    // Show server-wide chain embed
    await showChainEmbed(interaction, chainData, factionName);
  } catch (error) {
    logError('Error fetching chain status:', error);
    await interaction.editReply('❌ Error fetching chain status. Please try again later.');
  }
}

/**
 * Show chain status embed
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Object} chainData - Chain data
 * @param {string} factionName - Optional faction name
 */
async function showChainEmbed(interaction, chainData, factionName = null) {
  // Check if a chain is active
  const hasActiveChain = chainData && chainData.current > 0;
  
  // Create embed based on chain status
  const embed = new EmbedBuilder()
    .setTitle(`⛓️ ${factionName ? factionName + ' ' : ''}Chain Status`)
    .setColor(BOT_CONFIG.color)
    .setTimestamp();
  
  if (hasActiveChain) {
    // Chain is active
    embed.setDescription('```\nActive chain in progress!\n```')
      .addFields(
        { name: 'Chain Count', value: formatNumber(chainData.current), inline: true },
        { name: 'Time Remaining', value: formatTimeRemaining(chainData.timeout), inline: true }
      );
    
    // Add cooldown if available
    if (chainData.cooldown) {
      embed.addFields({ name: 'Cooldown', value: formatTimeRemaining(chainData.cooldown), inline: true });
    }
    
    // Add warning if chain is about to expire
    if (chainData.timeout < 300) { // Less than 5 minutes
      embed.addFields({
        name: '⚠️ Warning',
        value: 'Chain is about to expire! Hit someone quickly!',
        inline: false
      });
    }
    
    // Get chain alerts status for this server if available
    try {
      const { guildId } = interaction;
      const serverConfig = getServerConfig(guildId);
      
      if (serverConfig && serverConfig.chainAlerts) {
        const { enabled, minChain, warningTime, pingRole } = serverConfig.chainAlerts;
        
        embed.addFields({
          name: '🔔 Chain Alerts',
          value: `Status: ${enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                 `Minimum Chain: ${minChain} hits\n` +
                 `Alert Time: ${warningTime} minute(s) before expiry\n` +
                 `Alert Role: ${pingRole ? `<@&${pingRole}>` : 'Not set'}`,
          inline: false
        });
      }
    } catch (error) {
      // Silently continue if server config check fails
    }
  } else {
    // No active chain
    embed.setDescription('```\nNo active chain\n```')
      .addFields(
        { name: 'Status', value: 'Inactive', inline: true }
      );
    
    // Add cooldown if available
    if (chainData && chainData.cooldown) {
      embed.addFields({ name: 'Cooldown', value: formatTimeRemaining(chainData.cooldown), inline: true });
    }
  }
  
  // Add footer with last update time
  embed.setFooter({ 
    text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Last updated: ${new Date().toLocaleTimeString()}`
  });
  
  // Send the embed
  if (interaction.deferred) {
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed] });
  }
}

module.exports = { chainCommand };
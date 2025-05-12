/**
 * War Countdown command for BrotherOwlManager
 * Sets up and manages live updating war countdowns in designated channels
 */

const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  Colors,
  ChannelType
} = require('discord.js');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');

// Command creation with proper error isolation
const warcountdownCommand = {
  data: new SlashCommandBuilder()
    .setName('warcountdown')
    .setDescription('Set up a live updating countdown for faction wars')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up war countdown notifications')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to display war countdowns')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable or disable war countdowns')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check current war countdown configuration'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Clear the current war countdown')),

  /**
   * Execute command with safe error handling
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    try {
      // Safely execute the command with proper error isolation
      return await safeExecuteCommand(interaction, client);
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error executing warcountdown command (protected):', error);
      
      // Handle errors in responding to the interaction
      const errorResponse = {
        content: '❌ There was an error with the war countdown system. This error has been logged and will not affect other bot functionality.',
        ephemeral: true
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorResponse).catch(err => {
          logError('Error sending error followUp for warcountdown command:', err);
        });
      } else {
        await interaction.reply(errorResponse).catch(err => {
          logError('Error sending error reply for warcountdown command:', err);
        });
      }
    }
  },

  /**
   * Handle button interactions for war countdown
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    try {
      // Check for the refresh button
      if (interaction.customId === 'warcountdown_refresh') {
        // Load the war countdown service
        const warCountdownService = require('../services/war-countdown');
        
        // Use a try-catch to ensure button handling doesn't affect other functionality
        try {
          await warCountdownService.handleRefreshButton(interaction, client);
        } catch (error) {
          logError('Error in war countdown refresh button handler:', error);
          
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ There was an error refreshing the war countdown.',
              ephemeral: true
            });
          } else if (interaction.deferred) {
            await interaction.followUp({
              content: '❌ There was an error refreshing the war countdown.',
              ephemeral: true
            });
          }
        }
      }
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error handling warcountdown button (protected):', error);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ There was an error with the war countdown system.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.followUp({
            content: '❌ There was an error with the war countdown system.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending warcountdown button error reply:', replyError);
      }
    }
  }
};

/**
 * Safely execute command with proper error isolation
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function safeExecuteCommand(interaction, client) {
  // Get the subcommand
  const subcommand = interaction.options.getSubcommand();
  
  // Load the war countdown service
  // We load this inside the function to prevent it from affecting the bot if it fails
  const warCountdownService = require('../services/war-countdown');
  
  switch (subcommand) {
    case 'setup':
      await handleSetup(interaction, client, warCountdownService);
      break;
      
    case 'status':
      await handleStatus(interaction, client, warCountdownService);
      break;
      
    case 'clear':
      await handleClear(interaction, client, warCountdownService);
      break;
      
    default:
      await interaction.reply({
        content: '❌ Unknown subcommand.',
        ephemeral: true
      });
  }
}

/**
 * Handle setup subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} warCountdownService - War countdown service
 */
async function handleSetup(interaction, client, warCountdownService) {
  try {
    // Get options
    const channel = interaction.options.getChannel('channel');
    const enabled = interaction.options.getBoolean('enabled');
    
    // Validate channel type
    if (channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: '❌ Channel must be a text channel.',
        ephemeral: true
      });
    }
    
    // Check bot permissions in the channel
    const permissions = channel.permissionsFor(client.user);
    if (!permissions.has(PermissionFlagsBits.SendMessages) || 
        !permissions.has(PermissionFlagsBits.EmbedLinks)) {
      return interaction.reply({
        content: '❌ I need permissions to send messages and embed links in the selected channel.',
        ephemeral: true
      });
    }
    
    // Set countdown configuration
    const config = {
      enabled,
      channelId: channel.id
    };
    
    warCountdownService.setCountdownConfig(interaction.guildId, config);
    
    // If enabled, trigger an immediate check for wars
    if (enabled) {
      warCountdownService.checkWarsAndUpdateCountdowns(client);
    } else {
      // If disabled, clear any active countdown
      warCountdownService.clearActiveCountdown(interaction.guildId);
    }
    
    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('War Countdown Configuration')
      .setColor(enabled ? Colors.Green : Colors.Red)
      .setDescription(`War countdown has been ${enabled ? 'enabled' : 'disabled'}.`)
      .addFields(
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Status', value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Update Frequency', value: 'Countdowns update every minute\nWar checks run every 10 minutes', inline: false }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
    log(`War countdown ${enabled ? 'enabled' : 'disabled'} for server ${interaction.guildId}`);
    
  } catch (error) {
    logError('Error in handleSetup for war countdown:', error);
    throw error; // Let the outer error handler catch it
  }
}

/**
 * Handle status subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} warCountdownService - War countdown service
 */
async function handleStatus(interaction, client, warCountdownService) {
  try {
    // Get countdown configuration
    const config = warCountdownService.getCountdownConfig(interaction.guildId);
    
    if (!config) {
      return interaction.reply({
        content: '❌ War countdown has not been configured on this server.',
        ephemeral: true
      });
    }
    
    // Create status embed
    const embed = new EmbedBuilder()
      .setTitle('War Countdown Status')
      .setColor(config.enabled ? Colors.Green : Colors.Red)
      .setDescription('Current war countdown configuration:')
      .addFields(
        { name: 'Channel', value: config.channelId ? `<#${config.channelId}>` : 'Not set', inline: true },
        { name: 'Status', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Update Frequency', value: 'Countdowns update every minute\nWar checks run every 10 minutes', inline: false }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in handleStatus for war countdown:', error);
    throw error; // Let the outer error handler catch it
  }
}

/**
 * Handle clear subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} warCountdownService - War countdown service
 */
async function handleClear(interaction, client, warCountdownService) {
  try {
    // Clear active countdown
    warCountdownService.clearActiveCountdown(interaction.guildId);
    
    await interaction.reply({
      content: '✅ War countdown has been cleared. Any new wars will still be detected if the countdown system is enabled.',
      ephemeral: true
    });
    
    log(`War countdown cleared for server ${interaction.guildId}`);
    
  } catch (error) {
    logError('Error in handleClear for war countdown:', error);
    throw error; // Let the outer error handler catch it
  }
}

module.exports = { warcountdownCommand };
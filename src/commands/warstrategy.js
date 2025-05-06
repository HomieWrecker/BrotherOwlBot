/**
 * War Strategy command for BrotherOwlManager
 * Provides advanced war prediction, analytics, and personalized strategy recommendations
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
const warstrategyCommand = {
  data: new SlashCommandBuilder()
    .setName('warstrategy')
    .setDescription('Set up and manage the faction war strategy system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up the war strategy system')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to display war strategy room')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable or disable the war strategy system')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('prediction')
        .setDescription('Configure prediction algorithm settings')
        .addNumberOption(option =>
          option.setName('history_weight')
            .setDescription('Weight for historical data (0-100)')
            .setMinValue(0)
            .setMaxValue(100))
        .addNumberOption(option =>
          option.setName('strength_weight')
            .setDescription('Weight for strength assessment (0-100)')
            .setMinValue(0)
            .setMaxValue(100))
        .addNumberOption(option =>
          option.setName('activity_weight')
            .setDescription('Weight for activity analysis (0-100)')
            .setMinValue(0)
            .setMaxValue(100))
        .addNumberOption(option =>
          option.setName('randomness_weight')
            .setDescription('Weight for unknown factors (0-100)')
            .setMinValue(0)
            .setMaxValue(100)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('notifications')
        .setDescription('Configure war strategy notifications')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel for strategy notifications')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable or disable notifications')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('war_start')
            .setDescription('Notifications for war start')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('war_end')
            .setDescription('Notifications for war end')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('critical_events')
            .setDescription('Notifications for critical events')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check current war strategy system configuration'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset the war strategy system')),

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
      logError('Error executing warstrategy command (protected):', error);
      
      // Handle errors in responding to the interaction
      const errorResponse = {
        content: '❌ There was an error with the war strategy system. This error has been logged and will not affect other bot functionality.',
        ephemeral: true
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorResponse).catch(err => {
          logError('Error sending error followUp for warstrategy command:', err);
        });
      } else {
        await interaction.reply(errorResponse).catch(err => {
          logError('Error sending error reply for warstrategy command:', err);
        });
      }
    }
  },

  /**
   * Handle button interactions for war strategy
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    try {
      if (interaction.customId.startsWith('warstrategy_')) {
        // Load the war strategy service
        const warStrategyService = require('../services/war-strategy');
        
        // Use a try-catch to ensure button handling doesn't affect other functionality
        try {
          await warStrategyService.handleStrategyButton(interaction, client);
        } catch (error) {
          logError('Error in war strategy button handler:', error);
          
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ There was an error processing this war strategy action.',
              ephemeral: true
            });
          } else if (interaction.deferred) {
            await interaction.followUp({
              content: '❌ There was an error processing this war strategy action.',
              ephemeral: true
            });
          }
        }
      }
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error handling warstrategy button (protected):', error);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ There was an error with the war strategy system.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.followUp({
            content: '❌ There was an error with the war strategy system.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending warstrategy button error reply:', replyError);
      }
    }
  },

  /**
   * Handle modal submissions for war strategy
   * @param {ModalSubmitInteraction} interaction - Discord modal interaction
   * @param {Client} client - Discord client
   */
  async handleModal(interaction, client) {
    try {
      if (interaction.customId === 'warstrategy_plan_modal') {
        // Load the war strategy service
        const warStrategyService = require('../services/war-strategy');
        
        // Use a try-catch to ensure modal handling doesn't affect other functionality
        try {
          await warStrategyService.handlePlanModalSubmit(interaction, client);
        } catch (error) {
          logError('Error in war strategy modal handler:', error);
          
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ There was an error processing your war plan submission.',
              ephemeral: true
            });
          } else if (interaction.deferred) {
            await interaction.followUp({
              content: '❌ There was an error processing your war plan submission.',
              ephemeral: true
            });
          }
        }
      }
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error handling warstrategy modal (protected):', error);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ There was an error with the war strategy system.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.followUp({
            content: '❌ There was an error with the war strategy system.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending warstrategy modal error reply:', replyError);
      }
    }
  },

  /**
   * Handle select menu interactions for war strategy
   * @param {StringSelectMenuInteraction} interaction - Discord select menu interaction
   * @param {Client} client - Discord client
   */
  async handleSelectMenu(interaction, client) {
    try {
      if (interaction.customId.startsWith('warstrategy_')) {
        // Load the war strategy service
        const warStrategyService = require('../services/war-strategy');
        
        // Use a try-catch to ensure select menu handling doesn't affect other functionality
        try {
          await warStrategyService.handleStrategySelectMenu(interaction, client);
        } catch (error) {
          logError('Error in war strategy select menu handler:', error);
          
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ There was an error processing your selection.',
              ephemeral: true
            });
          } else if (interaction.deferred) {
            await interaction.followUp({
              content: '❌ There was an error processing your selection.',
              ephemeral: true
            });
          }
        }
      }
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error handling warstrategy select menu (protected):', error);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ There was an error with the war strategy system.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.followUp({
            content: '❌ There was an error with the war strategy system.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending warstrategy select menu error reply:', replyError);
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
  
  // Load the war strategy service
  // We load this inside the function to prevent it from affecting the bot if it fails
  const warStrategyService = require('../services/war-strategy');
  
  switch (subcommand) {
    case 'setup':
      await handleSetup(interaction, client, warStrategyService);
      break;
      
    case 'prediction':
      await handlePrediction(interaction, client, warStrategyService);
      break;
      
    case 'notifications':
      await handleNotifications(interaction, client, warStrategyService);
      break;
      
    case 'status':
      await handleStatus(interaction, client, warStrategyService);
      break;
      
    case 'reset':
      await handleReset(interaction, client, warStrategyService);
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
 * @param {Object} warStrategyService - War strategy service
 */
async function handleSetup(interaction, client, warStrategyService) {
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
    
    // Set war strategy configuration
    const config = {
      enabled,
      channelId: channel.id
    };
    
    warStrategyService.setStrategyRoomConfig(interaction.guildId, config);
    
    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('War Strategy System Configuration')
      .setColor(enabled ? Colors.Green : Colors.Red)
      .setDescription(`War strategy system has been ${enabled ? 'enabled' : 'disabled'}.`)
      .addFields(
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Status', value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Features', value: 'The war strategy system now provides:\n• Advanced predictive analytics\n• Personalized strategy recommendations\n• Performance tracking and war room management', inline: false }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
    log(`War strategy system ${enabled ? 'enabled' : 'disabled'} for server ${interaction.guildId}`);
    
  } catch (error) {
    logError('Error in handleSetup for war strategy:', error);
    throw error; // Let the outer error handler catch it
  }
}

/**
 * Handle prediction subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} warStrategyService - War strategy service
 */
async function handlePrediction(interaction, client, warStrategyService) {
  try {
    const serverId = interaction.guildId;
    
    // Get current configuration
    const currentConfig = warStrategyService.getStrategyRoomConfig(serverId);
    
    if (!currentConfig) {
      return interaction.reply({
        content: '❌ War strategy system has not been set up for this server. Please use the `/warstrategy setup` command first.',
        ephemeral: true
      });
    }
    
    // Get new weights
    let historyWeight = interaction.options.getNumber('history_weight');
    let strengthWeight = interaction.options.getNumber('strength_weight');
    let activityWeight = interaction.options.getNumber('activity_weight');
    let randomnessWeight = interaction.options.getNumber('randomness_weight');
    
    // If no weights provided, show current weights
    if (historyWeight === null && strengthWeight === null && 
        activityWeight === null && randomnessWeight === null) {
      
      const factorSettings = currentConfig.predictionSettings?.factors || {
        historyWeight: 0.4,
        strengthWeight: 0.3,
        activityWeight: 0.2,
        randomnessWeight: 0.1
      };
      
      const embed = new EmbedBuilder()
        .setTitle('War Prediction Settings')
        .setColor(Colors.Blue)
        .setDescription('Current prediction algorithm weight settings:')
        .addFields(
          { name: 'Historical Data Weight', value: `${factorSettings.historyWeight * 100}%`, inline: true },
          { name: 'Strength Assessment Weight', value: `${factorSettings.strengthWeight * 100}%`, inline: true },
          { name: 'Activity Analysis Weight', value: `${factorSettings.activityWeight * 100}%`, inline: true },
          { name: 'Unknown Factors Weight', value: `${factorSettings.randomnessWeight * 100}%`, inline: true }
        )
        .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
        .setTimestamp();
      
      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }
    
    // Validate weights - they should add up to 100
    let needsNormalization = false;
    const weights = [];
    
    // Convert percentages to decimals and handle nulls
    if (historyWeight !== null) weights.push(historyWeight / 100);
    else weights.push(currentConfig.predictionSettings?.factors?.historyWeight || 0.4);
    
    if (strengthWeight !== null) weights.push(strengthWeight / 100);
    else weights.push(currentConfig.predictionSettings?.factors?.strengthWeight || 0.3);
    
    if (activityWeight !== null) weights.push(activityWeight / 100);
    else weights.push(currentConfig.predictionSettings?.factors?.activityWeight || 0.2);
    
    if (randomnessWeight !== null) weights.push(randomnessWeight / 100);
    else weights.push(currentConfig.predictionSettings?.factors?.randomnessWeight || 0.1);
    
    // Check if they add up to 1.0
    const sum = weights.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      needsNormalization = true;
    }
    
    // Normalize if needed
    if (needsNormalization) {
      for (let i = 0; i < weights.length; i++) {
        weights[i] = weights[i] / sum;
      }
    }
    
    // Update configuration
    if (!currentConfig.predictionSettings) {
      currentConfig.predictionSettings = {
        factors: {
          historyWeight: weights[0],
          strengthWeight: weights[1],
          activityWeight: weights[2],
          randomnessWeight: weights[3]
        },
        confidenceThreshold: 70
      };
    } else {
      currentConfig.predictionSettings.factors = {
        historyWeight: weights[0],
        strengthWeight: weights[1],
        activityWeight: weights[2],
        randomnessWeight: weights[3]
      };
    }
    
    // Save the updated configuration
    warStrategyService.setStrategyRoomConfig(serverId, currentConfig);
    
    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('War Prediction Settings Updated')
      .setColor(Colors.Green)
      .setDescription('The prediction algorithm weights have been updated:')
      .addFields(
        { name: 'Historical Data Weight', value: `${Math.round(weights[0] * 100)}%`, inline: true },
        { name: 'Strength Assessment Weight', value: `${Math.round(weights[1] * 100)}%`, inline: true },
        { name: 'Activity Analysis Weight', value: `${Math.round(weights[2] * 100)}%`, inline: true },
        { name: 'Unknown Factors Weight', value: `${Math.round(weights[3] * 100)}%`, inline: true }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    if (needsNormalization) {
      embed.addFields({
        name: 'Note',
        value: 'The weights have been automatically normalized to sum to 100%.'
      });
    }
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in handlePrediction for war strategy:', error);
    throw error; // Let the outer error handler catch it
  }
}

/**
 * Handle notifications subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} warStrategyService - War strategy service
 */
async function handleNotifications(interaction, client, warStrategyService) {
  try {
    const serverId = interaction.guildId;
    
    // Get current configuration
    const currentConfig = warStrategyService.getStrategyRoomConfig(serverId);
    
    if (!currentConfig) {
      return interaction.reply({
        content: '❌ War strategy system has not been set up for this server. Please use the `/warstrategy setup` command first.',
        ephemeral: true
      });
    }
    
    // Get options
    const enabled = interaction.options.getBoolean('enabled');
    const channel = interaction.options.getChannel('channel');
    const warStart = interaction.options.getBoolean('war_start');
    const warEnd = interaction.options.getBoolean('war_end');
    const criticalEvents = interaction.options.getBoolean('critical_events');
    
    // Initialize notifications if not present
    if (!currentConfig.notifications) {
      currentConfig.notifications = {
        enabled: false,
        channelId: currentConfig.channelId,
        warStart: true,
        warEnd: true,
        criticalEvents: true
      };
    }
    
    // Update configuration
    currentConfig.notifications.enabled = enabled;
    
    if (channel) {
      // Validate channel type
      if (channel.type !== ChannelType.GuildText) {
        return interaction.reply({
          content: '❌ Notification channel must be a text channel.',
          ephemeral: true
        });
      }
      
      currentConfig.notifications.channelId = channel.id;
    }
    
    if (warStart !== null) currentConfig.notifications.warStart = warStart;
    if (warEnd !== null) currentConfig.notifications.warEnd = warEnd;
    if (criticalEvents !== null) currentConfig.notifications.criticalEvents = criticalEvents;
    
    // Save the updated configuration
    warStrategyService.setStrategyRoomConfig(serverId, currentConfig);
    
    // Create confirmation embed
    const notificationChannel = channel 
      ? `<#${channel.id}>` 
      : `<#${currentConfig.notifications.channelId || currentConfig.channelId}>`;
    
    const embed = new EmbedBuilder()
      .setTitle('War Strategy Notifications')
      .setColor(enabled ? Colors.Green : Colors.Red)
      .setDescription(`War strategy notifications have been ${enabled ? 'enabled' : 'disabled'}.`)
      .addFields(
        { name: 'Channel', value: notificationChannel, inline: true },
        { name: 'Status', value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'War Start', value: currentConfig.notifications.warStart ? '✅ Yes' : '❌ No', inline: true },
        { name: 'War End', value: currentConfig.notifications.warEnd ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Critical Events', value: currentConfig.notifications.criticalEvents ? '✅ Yes' : '❌ No', inline: true }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in handleNotifications for war strategy:', error);
    throw error; // Let the outer error handler catch it
  }
}

/**
 * Handle status subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} warStrategyService - War strategy service
 */
async function handleStatus(interaction, client, warStrategyService) {
  try {
    const serverId = interaction.guildId;
    
    // Get current configuration
    const config = warStrategyService.getStrategyRoomConfig(serverId);
    
    if (!config) {
      return interaction.reply({
        content: '❌ War strategy system has not been set up for this server. Please use the `/warstrategy setup` command first.',
        ephemeral: true
      });
    }
    
    // Create status embed
    const embed = new EmbedBuilder()
      .setTitle('War Strategy System Status')
      .setColor(config.enabled ? Colors.Green : Colors.Red)
      .setDescription('Current war strategy system configuration:')
      .addFields(
        { name: 'Status', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Strategy Room', value: config.channelId ? `<#${config.channelId}>` : 'Not set', inline: true }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // Add prediction settings if available
    if (config.predictionSettings) {
      const factors = config.predictionSettings.factors;
      
      embed.addFields({
        name: 'Prediction Algorithm Weights',
        value: [
          `Historical Data: ${Math.round(factors.historyWeight * 100)}%`,
          `Strength Assessment: ${Math.round(factors.strengthWeight * 100)}%`,
          `Activity Analysis: ${Math.round(factors.activityWeight * 100)}%`,
          `Unknown Factors: ${Math.round(factors.randomnessWeight * 100)}%`
        ].join('\n'),
        inline: false
      });
    }
    
    // Add notification settings if available
    if (config.notifications) {
      embed.addFields({
        name: 'Notifications',
        value: [
          `Status: ${config.notifications.enabled ? '✅ Enabled' : '❌ Disabled'}`,
          `Channel: ${config.notifications.channelId ? `<#${config.notifications.channelId}>` : 'Not set'}`,
          `War Start: ${config.notifications.warStart ? '✅ Yes' : '❌ No'}`,
          `War End: ${config.notifications.warEnd ? '✅ Yes' : '❌ No'}`,
          `Critical Events: ${config.notifications.criticalEvents ? '✅ Yes' : '❌ No'}`
        ].join('\n'),
        inline: false
      });
    }
    
    // Add strategy boards if available
    if (config.strategyBoards && config.strategyBoards.length > 0) {
      const activeBoards = config.strategyBoards.filter(board => board.status === 'active');
      
      if (activeBoards.length > 0) {
        embed.addFields({
          name: 'Active Strategy Plans',
          value: activeBoards.slice(0, 3).map(board => `• ${board.title}`).join('\n') +
                 (activeBoards.length > 3 ? `\n...and ${activeBoards.length - 3} more` : ''),
          inline: false
        });
      }
    }
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in handleStatus for war strategy:', error);
    throw error; // Let the outer error handler catch it
  }
}

/**
 * Handle reset subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} warStrategyService - War strategy service
 */
async function handleReset(interaction, client, warStrategyService) {
  try {
    const serverId = interaction.guildId;
    
    // Reset the configuration
    warStrategyService.setStrategyRoomConfig(serverId, {
      enabled: false,
      channelId: null,
      strategyBoards: [],
      memberPerformance: {},
      predictionSettings: {
        factors: {
          historyWeight: 0.4,
          strengthWeight: 0.3,
          activityWeight: 0.2,
          randomnessWeight: 0.1
        },
        confidenceThreshold: 70
      }
    });
    
    await interaction.reply({
      content: '✅ War strategy system has been reset to default settings. Use the `/warstrategy setup` command to reconfigure it.',
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in handleReset for war strategy:', error);
    throw error; // Let the outer error handler catch it
  }
}

module.exports = { warstrategyCommand };
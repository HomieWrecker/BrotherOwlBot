/**
 * Giveaway command for Brother Owl
 * Allows creation and management of community giveaways with reaction entry
 */

const { 
  SlashCommandBuilder, 
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');

// We'll load the giveaway service here to keep it isolated from the core bot
let giveawayService;
try {
  giveawayService = require('../services/giveaway-service');
} catch (error) {
  logError('Error loading giveaway service:', error);
}

// Giveaway command definition
module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create and manage giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new giveaway')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel to post the giveaway in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('duration')
            .setDescription('Duration in minutes (max 10080 = 1 week)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10080)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('end')
        .setDescription('Force-end a giveaway')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('The message ID of the giveaway to end')
            .setRequired(true))),
          
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
      logError('Error executing giveaway command (protected):', error);
      
      // Handle errors in responding to the interaction
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ There was an error with the giveaway system. This error has been logged and will not affect other bot functionality.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.followUp({
            content: '❌ There was an error with the giveaway system. This error has been logged and will not affect other bot functionality.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending giveaway command error reply:', replyError);
      }
    }
  },
  
  /**
   * Handle button interactions for giveaway
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    try {
      // Check if it's a giveaway-related button
      if (interaction.customId.startsWith('giveaway_')) {
        if (!giveawayService) {
          throw new Error('Giveaway service not loaded');
        }
        
        return await giveawayService.handleGiveawayButton(interaction);
      }
      
      return false;
    } catch (error) {
      logError('Error handling giveaway button (protected):', error);
      
      // Reply with error if not already replied
      if (!interaction.replied) {
        await interaction.reply({
          content: '❌ There was an error processing this giveaway action. This error has been logged and will not affect other bot functionality.',
          ephemeral: true
        }).catch(() => {});
      }
      
      return true; // We handled it, even though there was an error
    }
  },
  
  /**
   * Handle modal submissions for giveaway
   * @param {ModalSubmitInteraction} interaction - Discord modal interaction
   * @param {Client} client - Discord client
   */
  async handleModal(interaction, client) {
    try {
      // Check if it's a giveaway-related modal
      if (interaction.customId === 'giveaway_create_modal') {
        await handleCreateGiveawayModal(interaction, client);
        return true;
      }
      
      return false;
    } catch (error) {
      logError('Error handling giveaway modal (protected):', error);
      
      // Reply with error if not already replied
      if (!interaction.replied) {
        await interaction.reply({
          content: '❌ There was an error processing your giveaway submission. This error has been logged and will not affect other bot functionality.',
          ephemeral: true
        }).catch(() => {});
      }
      
      return true; // We handled it, even though there was an error
    }
  }
};

/**
 * Safely execute command with proper error isolation
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function safeExecuteCommand(interaction, client) {
  // Make sure we have the giveaway service
  if (!giveawayService) {
    return interaction.reply({
      content: '❌ The giveaway system is not available. This feature may not be installed correctly.',
      ephemeral: true
    });
  }
  
  const subcommand = interaction.options.getSubcommand();
  
  switch (subcommand) {
    case 'create':
      await handleCreateGiveaway(interaction, client);
      break;
      
    case 'end':
      await handleEndGiveaway(interaction, client);
      break;
      
    default:
      await interaction.reply({
        content: '❌ Unknown subcommand.',
        ephemeral: true
      });
  }
}

/**
 * Handle giveaway creation
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleCreateGiveaway(interaction, client) {
  try {
    // Get the channel and duration
    const channel = interaction.options.getChannel('channel');
    const duration = interaction.options.getInteger('duration');
    
    // Check if we can send messages in the channel
    if (!channel.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({
        content: `❌ I don't have permission to send messages in ${channel}.`,
        ephemeral: true
      });
    }
    
    // Check if we can add reactions in the channel
    if (!channel.permissionsFor(client.user).has(PermissionFlagsBits.AddReactions)) {
      return interaction.reply({
        content: `❌ I don't have permission to add reactions in ${channel}.`,
        ephemeral: true
      });
    }
    
    // Store the channel and duration in the modal state
    const modalId = `giveaway_create_modal`;
    
    // Create the modal
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle('Create a Giveaway');
      
    // Add inputs
    const prizeInput = new TextInputBuilder()
      .setCustomId('prize')
      .setLabel('What are you giving away?')
      .setPlaceholder('e.g. 5 million Torn cash, a level 50 account, etc.')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);
      
    const hostInput = new TextInputBuilder()
      .setCustomId('host')
      .setLabel('Who is hosting this giveaway?')
      .setPlaceholder('Your name, faction name, etc.')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);
      
    const emojiInput = new TextInputBuilder()
      .setCustomId('emoji')
      .setLabel('Entry reaction emoji (default: 🎉)')
      .setPlaceholder('A single emoji like 🎉, 🎁, 🎊, etc.')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(5);
      
    // Add inputs to the modal
    const prizeRow = new ActionRowBuilder().addComponents(prizeInput);
    const hostRow = new ActionRowBuilder().addComponents(hostInput);
    const emojiRow = new ActionRowBuilder().addComponents(emojiInput);
    
    modal.addComponents(prizeRow, hostRow, emojiRow);
    
    // Save the channel and duration for later use in the modal submission
    interaction.client.giveawayCreationData = interaction.client.giveawayCreationData || {};
    interaction.client.giveawayCreationData[interaction.user.id] = {
      channelId: channel.id,
      duration: duration
    };
    
    // Show the modal
    await interaction.showModal(modal);
  } catch (error) {
    logError('Error showing giveaway creation modal:', error);
    
    await interaction.reply({
      content: '❌ There was an error starting the giveaway creation process.',
      ephemeral: true
    });
  }
}

/**
 * Handle giveaway creation modal submission
 * @param {ModalSubmitInteraction} interaction - Discord modal interaction
 * @param {Client} client - Discord client
 */
async function handleCreateGiveawayModal(interaction, client) {
  try {
    // Get the values from the modal
    const prize = interaction.fields.getTextInputValue('prize');
    const host = interaction.fields.getTextInputValue('host');
    let emoji = interaction.fields.getTextInputValue('emoji');
    
    // If no emoji was provided, use the default
    if (!emoji) emoji = '🎉';
    
    // Check if we have the necessary data
    if (!client.giveawayCreationData || !client.giveawayCreationData[interaction.user.id]) {
      return interaction.reply({
        content: '❌ Giveaway creation data not found. Please try again.',
        ephemeral: true
      });
    }
    
    // Get the channel and duration
    const { channelId, duration } = client.giveawayCreationData[interaction.user.id];
    const channel = await client.channels.fetch(channelId);
    
    if (!channel) {
      return interaction.reply({
        content: '❌ Target channel not found. Please try again.',
        ephemeral: true
      });
    }
    
    // Acknowledge the modal submission
    await interaction.deferReply({ ephemeral: true });
    
    // Create the giveaway
    const giveaway = await giveawayService.createGiveaway(
      channel,
      { prize, host, duration, emoji },
      interaction.user
    );
    
    // Clean up the creation data
    delete client.giveawayCreationData[interaction.user.id];
    
    // Respond with success
    await interaction.followUp({
      content: `✅ Giveaway created in ${channel}! The giveaway will last for ${duration} minutes.`,
      ephemeral: true
    });
    
    // Post a public message announcing the giveaway
    const publicChannel = interaction.channel;
    if (publicChannel && publicChannel.id !== channel.id) {
      await publicChannel.send({
        content: `🎉 A new giveaway has been started in ${channel}! Prize: **${prize}** (hosted by ${host})`
      });
    }
  } catch (error) {
    logError('Error handling giveaway creation modal:', error);
    
    await interaction.reply({
      content: '❌ There was an error creating the giveaway.',
      ephemeral: true
    });
  }
}

/**
 * Handle giveaway ending
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleEndGiveaway(interaction, client) {
  try {
    // Get the message ID
    const messageId = interaction.options.getString('message_id');
    
    // Acknowledge the command
    await interaction.deferReply({ ephemeral: true });
    
    // Try to end the giveaway
    const result = await giveawayService.endGiveaway(messageId, client, true);
    
    // Respond with the result
    await interaction.followUp({
      content: '✅ Giveaway ended successfully.',
      ephemeral: true
    });
  } catch (error) {
    logError('Error ending giveaway:', error);
    
    await interaction.followUp({
      content: '❌ There was an error ending the giveaway. Make sure the message ID is correct and the giveaway is still active.',
      ephemeral: true
    });
  }
}
/**
 * Welcome command for Brother Owl
 * Handles configuration of the welcome system for new members
 * 
 * IMPORTANT: This command is designed with isolation in mind to prevent it
 * from affecting the core bot functionality if errors occur
 */

const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ChannelType 
} = require('discord.js');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const { 
  getWelcomeConfig, 
  setWelcomeConfig, 
  isWelcomeConfigured,
  ROLE_DESCRIPTIONS
} = require('../services/welcome-service');

// Command creation with error handling wrapper
const welcomeCommand = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure and manage the welcome system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up or update the welcome system')
        .addChannelOption(option =>
          option.setName('welcome_channel')
            .setDescription('Channel to send welcome messages in')
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('verification_channel')
            .setDescription('Channel for member verification requests')
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('log_channel')
            .setDescription('Channel for logging member events')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('approver_role')
            .setDescription('Role that can approve new members')
            .setRequired(false))
        .addRoleOption(option =>
          option.setName('member_role')
            .setDescription('Role to assign to verified members')
            .setRequired(false))
        .addRoleOption(option =>
          option.setName('ally_role')
            .setDescription('Role to assign to allies')
            .setRequired(false))
        .addRoleOption(option =>
          option.setName('trader_role')
            .setDescription('Role to assign to traders')
            .setRequired(false))
        .addRoleOption(option =>
          option.setName('guest_role')
            .setDescription('Role to assign to guests')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check the current welcome system configuration'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable the welcome system')),

  /**
   * Execute the command with comprehensive error handling
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    try {
      // Safely execute the welcome command with error boundary
      return await safeExecuteCommand(interaction, client);
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error executing welcome command (protected):', error);
      
      // Handle errors in responding to the interaction
      const errorResponse = {
        content: '❌ There was an error with the welcome system. This error has been logged and will not affect other bot functionality.',
        ephemeral: true
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorResponse).catch(err => {
          logError('Error sending error followUp for welcome command:', err);
        });
      } else {
        await interaction.reply(errorResponse).catch(err => {
          logError('Error sending error reply for welcome command:', err);
        });
      }
    }
  },

  /**
   * Handle button interactions for welcome-related buttons
   * This method is wrapped with error handling to prevent it from affecting the core bot
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    try {
      // Extract action and arguments from the button custom ID
      // Format: welcome_action_arg_userId
      const parts = interaction.customId.split('_');
      const action = parts[1];
      const arg = parts[2];
      const userId = parts[3];
      
      // Load welcome service only when needed
      const welcomeService = require('../services/welcome-service');
      
      // Route to the appropriate handler based on the action
      switch (action) {
        case 'role':
          await welcomeService.handleRoleSelection(interaction, arg, userId);
          break;
          
        case 'verify':
          await welcomeService.handleVerification(interaction, arg, userId);
          break;
          
        default:
          await interaction.reply({
            content: '❌ Unknown welcome action.',
            ephemeral: true
          });
      }
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error handling welcome button interaction (protected):', error);
      
      try {
        if (!interaction.replied) {
          await interaction.reply({
            content: '❌ There was an error processing this welcome action. This error has been logged and will not affect other bot functionality.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending welcome button error reply:', replyError);
      }
    }
  }
};

/**
 * Safely execute the welcome command with proper error boundaries
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function safeExecuteCommand(interaction, client) {
  // Get the subcommand
  const subcommand = interaction.options.getSubcommand();
  
  switch (subcommand) {
    case 'setup':
      await handleSetup(interaction, client);
      break;
      
    case 'status':
      await handleStatus(interaction, client);
      break;
      
    case 'disable':
      await handleDisable(interaction, client);
      break;
      
    default:
      await interaction.reply({
        content: '❌ Unknown subcommand.',
        ephemeral: true
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
    // Get options
    const welcomeChannel = interaction.options.getChannel('welcome_channel');
    const verificationChannel = interaction.options.getChannel('verification_channel');
    const logChannel = interaction.options.getChannel('log_channel');
    const approverRole = interaction.options.getRole('approver_role');
    const memberRole = interaction.options.getRole('member_role');
    const allyRole = interaction.options.getRole('ally_role');
    const traderRole = interaction.options.getRole('trader_role');
    const guestRole = interaction.options.getRole('guest_role');
    
    // Validate channel types
    if (welcomeChannel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: '❌ Welcome channel must be a text channel.',
        ephemeral: true
      });
    }
    
    if (verificationChannel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: '❌ Verification channel must be a text channel.',
        ephemeral: true
      });
    }
    
    if (logChannel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: '❌ Log channel must be a text channel.',
        ephemeral: true
      });
    }
    
    // Create the config
    const config = {
      welcomeChannelId: welcomeChannel.id,
      verificationChannelId: verificationChannel.id,
      logChannelId: logChannel.id,
      approverRoleId: approverRole ? approverRole.id : null,
      memberRoleId: memberRole ? memberRole.id : null,
      contractorRoleId: contractorRole ? contractorRole.id : null,
      allyRoleId: allyRole ? allyRole.id : null,
      traderRoleId: traderRole ? traderRole.id : null,
      guestRoleId: guestRole ? guestRole.id : null,
      enabled: true
    };
    
    // Save the config
    setWelcomeConfig(interaction.guildId, config);
    
    // Create response embed
    const embed = new EmbedBuilder()
      .setTitle('✅ Welcome System Configured')
      .setColor(BOT_CONFIG.color)
      .setDescription('The welcome system has been configured successfully. New members will now receive a welcome message with role selection options.')
      .addFields(
        { name: 'Welcome Channel', value: `<#${welcomeChannel.id}>`, inline: true },
        { name: 'Verification Channel', value: `<#${verificationChannel.id}>`, inline: true },
        { name: 'Log Channel', value: `<#${logChannel.id}>`, inline: true },
        { name: 'Approver Role', value: approverRole ? `<@&${approverRole.id}>` : 'Not set (Administrators only)', inline: true },
        { name: 'Member Role', value: memberRole ? `<@&${memberRole.id}>` : 'Using "Member" role', inline: true }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
    // Log welcome system setup
    log(`Welcome system configured for server ${interaction.guildId} by ${interaction.user.tag}`);
  } catch (error) {
    // This is already within the safe execution wrapper, but we add another layer
    // of protection to ensure the error is properly logged and doesn't affect the bot
    logError('Error in handleSetup:', error);
    throw error; // Let the outer handler catch it
  }
}

/**
 * Handle the status subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleStatus(interaction, client) {
  try {
    // Get the config
    const config = getWelcomeConfig(interaction.guildId);
    
    if (!config || !config.enabled) {
      return interaction.reply({
        content: '❌ The welcome system is not configured or has been disabled.',
        ephemeral: true
      });
    }
    
    // Create response embed
    const embed = new EmbedBuilder()
      .setTitle('Welcome System Status')
      .setColor(BOT_CONFIG.color)
      .setDescription('Current welcome system configuration:')
      .addFields(
        { name: 'Status', value: config.enabled ? '✅ Enabled' : '❌ Disabled', inline: false },
        { name: 'Welcome Channel', value: config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : 'Not set', inline: true },
        { name: 'Verification Channel', value: config.verificationChannelId ? `<#${config.verificationChannelId}>` : 'Not set', inline: true },
        { name: 'Log Channel', value: config.logChannelId ? `<#${config.logChannelId}>` : 'Not set', inline: true },
        { name: 'Approver Role', value: config.approverRoleId ? `<@&${config.approverRoleId}>` : 'Not set (Administrators only)', inline: true },
        { name: 'Member Role', value: config.memberRoleId ? `<@&${config.memberRoleId}>` : 'Using "Member" role', inline: true }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // Add role configuration section
    const roleFields = [];
    
    if (config.memberRoleId) roleFields.push({ name: 'Member Role', value: `<@&${config.memberRoleId}>`, inline: true });
    if (config.contractorRoleId) roleFields.push({ name: 'Contractor Role', value: `<@&${config.contractorRoleId}>`, inline: true });
    if (config.allyRoleId) roleFields.push({ name: 'Ally Role', value: `<@&${config.allyRoleId}>`, inline: true });
    if (config.traderRoleId) roleFields.push({ name: 'Trader Role', value: `<@&${config.traderRoleId}>`, inline: true });
    if (config.guestRoleId) roleFields.push({ name: 'Guest Role', value: `<@&${config.guestRoleId}>`, inline: true });
    
    if (roleFields.length > 0) {
      embed.addFields({ name: 'Role Configuration', value: ' ', inline: false });
      embed.addFields(...roleFields);
    }
    
    // Add role descriptions
    embed.addFields({ name: 'Role Descriptions', value: ' ', inline: false });
    
    for (const [role, description] of Object.entries(ROLE_DESCRIPTIONS)) {
      embed.addFields({ name: role, value: description, inline: true });
    }
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    logError('Error in handleStatus:', error);
    throw error; // Let the outer handler catch it
  }
}

/**
 * Handle the disable subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleDisable(interaction, client) {
  try {
    // Get the config
    const config = getWelcomeConfig(interaction.guildId);
    
    if (!config || !config.enabled) {
      return interaction.reply({
        content: '❌ The welcome system is already disabled or not configured.',
        ephemeral: true
      });
    }
    
    // Disable the welcome system
    setWelcomeConfig(interaction.guildId, { enabled: false });
    
    await interaction.reply({
      content: '✅ The welcome system has been disabled. New members will no longer receive welcome messages or role selection options.',
      ephemeral: true
    });
    
    // Log welcome system disabled
    log(`Welcome system disabled for server ${interaction.guildId} by ${interaction.user.tag}`);
  } catch (error) {
    logError('Error in handleDisable:', error);
    throw error; // Let the outer handler catch it
  }
}

module.exports = { welcomeCommand };
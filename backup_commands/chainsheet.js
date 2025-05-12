/**
 * ChainSheet command for BrotherOwlManager
 * Allows faction administrators to create a live updating chain signup sheet
 */

const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const { createChainsheet, getChainsheet, getActiveChainsheets, closeChainsheet, addParticipant, removeParticipant, setChainsheetMessage, updateChainCount, getUserTimezone, createChainsheetEmbed, createChainsheetActionRow, startChainsheetUpdates } = require('../services/chainsheet-service');
const { getServerConfig, hasRequiredConfig } = require('../services/server-config');

// Common timezone list for autocomplete
const COMMON_TIMEZONES = [
  'UTC', 'GMT', 
  'EST', 'EDT', 'CST', 'CDT', 'MST', 'MDT', 'PST', 'PDT', 
  'BST', 'CET', 'CEST', 'EET', 'EEST', 
  'IST', 'JST', 'AEST', 'AEDT', 'NZST', 'NZDT',
  'UTC+1', 'UTC+2', 'UTC+3', 'UTC+4', 'UTC+5', 'UTC+6',
  'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+11', 'UTC+12',
  'UTC-1', 'UTC-2', 'UTC-3', 'UTC-4', 'UTC-5', 'UTC-6',
  'UTC-7', 'UTC-8', 'UTC-9', 'UTC-10', 'UTC-11', 'UTC-12'
];

// Command creation
const chainsheetCommand = {
  data: new SlashCommandBuilder()
    .setName('chainsheet')
    .setDescription('Manage chain signup sheets')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new chain signup sheet')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel to post the chainsheet in')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Title for the chainsheet')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Description for the chainsheet')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List active chainsheets in this server'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close an active chainsheet')
        .addStringOption(option =>
          option.setName('sheet_id')
            .setDescription('ID of the chainsheet to close')
            .setRequired(true)
            .setAutocomplete(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Update chain count for a chainsheet')
        .addStringOption(option =>
          option.setName('sheet_id')
            .setDescription('ID of the chainsheet to update')
            .setRequired(true)
            .setAutocomplete(true))
        .addIntegerOption(option =>
          option.setName('count')
            .setDescription('Current chain count')
            .setRequired(true)
            .setMinValue(0)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('signup')
        .setDescription('Sign up for a chainsheet slot')
        .addStringOption(option =>
          option.setName('sheet_id')
            .setDescription('ID of the chainsheet to sign up for')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(option =>
          option.setName('start_time')
            .setDescription('Your start time (format: HH:MM)')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('end_time')
            .setDescription('Your end time (format: HH:MM)')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('timezone')
            .setDescription('Your timezone (e.g., UTC, EST, PST)')
            .setRequired(false)
            .setAutocomplete(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('withdraw')
        .setDescription('Withdraw from a chainsheet')
        .addStringOption(option =>
          option.setName('sheet_id')
            .setDescription('ID of the chainsheet to withdraw from')
            .setRequired(true)
            .setAutocomplete(true))),

  /**
   * Handle slash command execution
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    try {
      // Check if server is configured
      if (!hasRequiredConfig(interaction.guildId)) {
        return interaction.reply({
          content: "⚠️ This server hasn't been fully configured yet. An administrator needs to run `/faction setup` first.",
          ephemeral: true
        });
      }

      const subcommand = interaction.options.getSubcommand();
      
      switch (subcommand) {
        case 'create':
          await handleCreateChainsheet(interaction, client);
          break;
        case 'list':
          await handleListChainsheets(interaction, client);
          break;
        case 'close':
          await handleCloseChainsheet(interaction, client);
          break;
        case 'update':
          await handleUpdateChainCount(interaction, client);
          break;
        case 'signup':
          await handleSignup(interaction, client);
          break;
        case 'withdraw':
          await handleWithdraw(interaction, client);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown subcommand',
            ephemeral: true
          });
      }
    } catch (error) {
      // This try-catch block catches errors in command execution
      // and prevents them from affecting the rest of the bot
      logError('Error executing chainsheet command:', error);
      
      // Reply with an error message
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: '❌ An error occurred while processing your request. This error has been logged and will not affect other bot functionality.',
          components: []
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: '❌ An error occurred while processing your request. This error has been logged and will not affect other bot functionality.',
          ephemeral: true
        }).catch(() => {});
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
      const [action, sheetId] = interaction.customId.split('_').slice(1);
      
      switch (action) {
        case 'signup':
          // Show signup modal
          await showSignupModal(interaction, sheetId);
          break;
          
        case 'withdraw':
          // Handle withdrawal directly
          await handleButtonWithdraw(interaction, client, sheetId);
          break;
          
        case 'updateCount':
          // Show update chain count modal
          await showUpdateCountModal(interaction, sheetId);
          break;
          
        case 'close':
          // Confirm close
          await showCloseConfirmation(interaction, sheetId);
          break;
          
        case 'confirmClose':
          // Close the chainsheet
          await handleConfirmClose(interaction, client, sheetId);
          break;
          
        case 'cancelClose':
          // Cancel close
          await interaction.update({
            content: '✅ Chainsheet closure cancelled.',
            components: [],
            ephemeral: true
          });
          break;
          
        default:
          await interaction.reply({
            content: '❌ Unknown action',
            ephemeral: true
          });
      }
    } catch (error) {
      logError('Error handling chainsheet button interaction:', error);
      
      // Try to respond with an error
      try {
        if (!interaction.replied) {
          await interaction.reply({
            content: '❌ An error occurred while processing your request. This error has been logged and will not affect other bot functionality.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending button error reply:', replyError);
      }
    }
  },

  /**
   * Handle modal submissions
   * @param {ModalSubmitInteraction} interaction - Discord modal interaction
   * @param {Client} client - Discord client
   */
  async handleModal(interaction, client) {
    try {
      const [action, sheetId] = interaction.customId.split('_').slice(1);
      
      switch (action) {
        case 'signup':
          // Process signup
          await handleModalSignup(interaction, client, sheetId);
          break;
          
        case 'updateCount':
          // Process chain count update
          await handleModalUpdateCount(interaction, client, sheetId);
          break;
          
        default:
          await interaction.reply({
            content: '❌ Unknown action',
            ephemeral: true
          });
      }
    } catch (error) {
      logError('Error handling chainsheet modal submission:', error);
      
      // Try to respond with an error
      try {
        if (!interaction.replied) {
          await interaction.reply({
            content: '❌ An error occurred while processing your request. This error has been logged and will not affect other bot functionality.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending modal error reply:', replyError);
      }
    }
  },

  /**
   * Handle autocomplete interactions
   * @param {AutocompleteInteraction} interaction - Discord autocomplete interaction
   * @param {Client} client - Discord client
   */
  async handleAutocomplete(interaction, client) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      
      if (focusedOption.name === 'sheet_id') {
        // Get active chainsheets for this server
        const chainsheets = getActiveChainsheets(interaction.guildId);
        
        // Filter by partial matches on ID
        const filtered = chainsheets
          .filter(sheet => sheet.id.includes(focusedOption.value))
          .slice(0, 25); // Max 25 choices
          
        // Format for autocomplete
        const choices = filtered.map(sheet => ({
          name: `${sheet.options.title || 'Chain Sheet'} (ID: ${sheet.id})`,
          value: sheet.id
        }));
        
        await interaction.respond(choices);
      } else if (focusedOption.name === 'timezone') {
        // Get user's saved timezone
        const userTimezone = getUserTimezone(interaction.user.id);
        
        // Filter common timezones based on input
        const filtered = COMMON_TIMEZONES
          .filter(tz => tz.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25); // Max 25 choices
        
        // If user has a saved timezone, push it to the top
        const choices = filtered.map(tz => ({
          name: tz + (tz === userTimezone ? ' (Your saved timezone)' : ''),
          value: tz
        }));
        
        // Sort to put user's timezone first
        if (userTimezone) {
          choices.sort((a, b) => {
            if (a.value === userTimezone) return -1;
            if (b.value === userTimezone) return 1;
            return 0;
          });
        }
        
        await interaction.respond(choices);
      }
    } catch (error) {
      logError('Error handling chainsheet autocomplete:', error);
      await interaction.respond([]).catch(() => {});
    }
  }
};

/**
 * Handle the create chainsheet subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleCreateChainsheet(interaction, client) {
  try {
    // Check permissions
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({
        content: '❌ You need the "Manage Server" permission to create chainsheets.',
        ephemeral: true
      });
    }
    
    // Get options
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title') || 'Chain Sign-up Sheet';
    const description = interaction.options.getString('description') || 
      'Sign up for chain hits by providing your available time slots. The bot will convert your local time to Torn City time (UTC).';
    
    // Validate channel type
    if (!channel.isTextBased()) {
      return interaction.reply({
        content: '❌ Please select a text channel for the chainsheet.',
        ephemeral: true
      });
    }
    
    // Defer reply as this might take some time
    await interaction.deferReply({ ephemeral: true });
    
    // Create chainsheet
    const chainsheet = await createChainsheet(
      interaction.guildId,
      channel.id,
      interaction.user.id,
      { title, description }
    );
    
    if (!chainsheet) {
      return interaction.editReply({
        content: '❌ Failed to create chainsheet. Please try again later.',
        ephemeral: true
      });
    }
    
    // Create embed and action row
    const embed = await createChainsheetEmbed(chainsheet, client);
    const actionRow = createChainsheetActionRow(chainsheet.id, true);
    
    // Send to channel
    const message = await channel.send({
      embeds: [embed],
      components: [actionRow]
    });
    
    // Update chainsheet with message ID
    setChainsheetMessage(interaction.guildId, chainsheet.id, message.id);
    
    // Start auto-updates
    startChainsheetUpdates(chainsheet.id, interaction.guildId, channel.id, message.id, client);
    
    // Respond to the user
    await interaction.editReply({
      content: `✅ Chainsheet created successfully in ${channel}!\n\n**ID:** \`${chainsheet.id}\`\n\nUse this ID to update or close the chainsheet later.`,
      ephemeral: true
    });
  } catch (error) {
    logError('Error creating chainsheet:', error);
    
    if (interaction.deferred) {
      await interaction.editReply({
        content: '❌ An error occurred while creating the chainsheet.',
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: '❌ An error occurred while creating the chainsheet.',
        ephemeral: true
      });
    }
  }
}

/**
 * Handle the list chainsheets subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleListChainsheets(interaction, client) {
  // Get active chainsheets
  const sheets = getActiveChainsheets(interaction.guildId);
  
  if (sheets.length === 0) {
    return interaction.reply({
      content: 'There are no active chainsheets in this server.',
      ephemeral: true
    });
  }
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('🔗 Active Chainsheets')
    .setColor(BOT_CONFIG.color)
    .setDescription(`There are ${sheets.length} active chainsheets in this server.`)
    .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
  
  // Add each chainsheet
  for (const sheet of sheets) {
    embed.addFields({
      name: sheet.options.title || 'Chain Sign-up Sheet',
      value: `**ID:** \`${sheet.id}\`\n**Channel:** <#${sheet.channelId}>\n**Created by:** <@${sheet.creatorId}>\n**Participants:** ${sheet.participants.length}`,
      inline: false
    });
  }
  
  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

/**
 * Handle the close chainsheet subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleCloseChainsheet(interaction, client) {
  // Check permissions
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({
      content: '❌ You need the "Manage Server" permission to close chainsheets.',
      ephemeral: true
    });
  }
  
  // Get options
  const sheetId = interaction.options.getString('sheet_id');
  
  // Get chainsheet
  const chainsheet = getChainsheet(interaction.guildId, sheetId);
  
  if (!chainsheet || !chainsheet.active) {
    return interaction.reply({
      content: '❌ Chainsheet not found or already closed.',
      ephemeral: true
    });
  }
  
  // Check if the user is the creator
  if (chainsheet.creatorId !== interaction.user.id && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({
      content: '❌ Only the creator of the chainsheet or a server administrator can close it.',
      ephemeral: true
    });
  }
  
  // Show confirmation
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`chainsheet_confirmClose_${sheetId}`)
        .setLabel('Yes, close it')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('chainsheet_cancelClose')
        .setLabel('No, keep it open')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.reply({
    content: `⚠️ Are you sure you want to close the chainsheet "${chainsheet.options.title || 'Chain Sign-up Sheet'}"?\n\nThis will stop the live updates and prevent further signups. Participants will no longer receive reminders.`,
    components: [row],
    ephemeral: true
  });
}

/**
 * Handle the update chain count subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleUpdateChainCount(interaction, client) {
  // Check permissions
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({
      content: '❌ You need the "Manage Server" permission to update chain count.',
      ephemeral: true
    });
  }
  
  // Get options
  const sheetId = interaction.options.getString('sheet_id');
  const count = interaction.options.getInteger('count');
  
  // Get chainsheet
  const chainsheet = getChainsheet(interaction.guildId, sheetId);
  
  if (!chainsheet || !chainsheet.active) {
    return interaction.reply({
      content: '❌ Chainsheet not found or already closed.',
      ephemeral: true
    });
  }
  
  // Update chain count
  updateChainCount(interaction.guildId, sheetId, count);
  
  await interaction.reply({
    content: `✅ Chain count updated to **${count.toLocaleString()}** for chainsheet "${chainsheet.options.title || 'Chain Sign-up Sheet'}"`,
    ephemeral: true
  });
}

/**
 * Handle the signup subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleSignup(interaction, client) {
  // Get options
  const sheetId = interaction.options.getString('sheet_id');
  const startTime = interaction.options.getString('start_time');
  const endTime = interaction.options.getString('end_time');
  const timezone = interaction.options.getString('timezone') || getUserTimezone(interaction.user.id) || 'UTC';
  
  // Validate time format
  if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
    return interaction.reply({
      content: '❌ Invalid time format. Please use the format HH:MM (e.g., 14:30 for 2:30 PM).',
      ephemeral: true
    });
  }
  
  // Get chainsheet
  const chainsheet = getChainsheet(interaction.guildId, sheetId);
  
  if (!chainsheet || !chainsheet.active) {
    return interaction.reply({
      content: '❌ Chainsheet not found or already closed.',
      ephemeral: true
    });
  }
  
  // Process signup
  const updatedSheet = addParticipant(
    interaction.guildId,
    sheetId,
    interaction.user.id,
    startTime,
    endTime,
    timezone
  );
  
  if (!updatedSheet) {
    return interaction.reply({
      content: '❌ Failed to sign up. Please try again later.',
      ephemeral: true
    });
  }
  
  await interaction.reply({
    content: `✅ You've successfully signed up for the chainsheet "${chainsheet.options.title || 'Chain Sign-up Sheet'}" from ${startTime} to ${endTime} ${timezone}. Your time has been converted to Torn City time (UTC) and added to the sheet. You'll receive a reminder when your shift starts.`,
    ephemeral: true
  });
}

/**
 * Handle the withdraw subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleWithdraw(interaction, client) {
  // Get options
  const sheetId = interaction.options.getString('sheet_id');
  
  // Get chainsheet
  const chainsheet = getChainsheet(interaction.guildId, sheetId);
  
  if (!chainsheet) {
    return interaction.reply({
      content: '❌ Chainsheet not found.',
      ephemeral: true
    });
  }
  
  // Check if user is a participant
  const isParticipant = chainsheet.participants.some(p => p.userId === interaction.user.id);
  
  if (!isParticipant) {
    return interaction.reply({
      content: '❌ You are not signed up for this chainsheet.',
      ephemeral: true
    });
  }
  
  // Process withdrawal
  const updatedSheet = removeParticipant(
    interaction.guildId,
    sheetId,
    interaction.user.id
  );
  
  if (!updatedSheet) {
    return interaction.reply({
      content: '❌ Failed to withdraw. Please try again later.',
      ephemeral: true
    });
  }
  
  await interaction.reply({
    content: `✅ You've successfully withdrawn from the chainsheet "${chainsheet.options.title || 'Chain Sign-up Sheet'}"`,
    ephemeral: true
  });
}

/**
 * Show signup modal
 * @param {ButtonInteraction} interaction - Discord interaction
 * @param {string} sheetId - Chainsheet ID
 */
async function showSignupModal(interaction, sheetId) {
  try {
    // Get chainsheet
    const chainsheet = getChainsheet(interaction.guildId, sheetId);
    
    if (!chainsheet || !chainsheet.active) {
      return interaction.reply({
        content: '❌ Chainsheet not found or already closed.',
        ephemeral: true
      });
    }
    
    // Get user's saved timezone
    const savedTimezone = getUserTimezone(interaction.user.id) || 'UTC';
    
    // Create modal
    const modal = new ModalBuilder()
      .setCustomId(`chainsheet_signup_${sheetId}`)
      .setTitle('Sign Up for Chain');
    
    // Add form inputs
    const startTimeInput = new TextInputBuilder()
      .setCustomId('startTime')
      .setLabel('Start Time (HH:MM format, e.g. 14:30)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    const endTimeInput = new TextInputBuilder()
      .setCustomId('endTime')
      .setLabel('End Time (HH:MM format, e.g. 16:30)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    const timezoneInput = new TextInputBuilder()
      .setCustomId('timezone')
      .setLabel(`Timezone (e.g. UTC, EST, PST)`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(savedTimezone)
      .setPlaceholder('Enter your timezone');
    
    // Add inputs to modal
    const startTimeRow = new ActionRowBuilder().addComponents(startTimeInput);
    const endTimeRow = new ActionRowBuilder().addComponents(endTimeInput);
    const timezoneRow = new ActionRowBuilder().addComponents(timezoneInput);
    
    modal.addComponents(startTimeRow, endTimeRow, timezoneRow);
    
    // Show the modal
    await interaction.showModal(modal);
  } catch (error) {
    logError('Error showing signup modal:', error);
    
    await interaction.reply({
      content: '❌ An error occurred while showing the signup form.',
      ephemeral: true
    });
  }
}

/**
 * Show update chain count modal
 * @param {ButtonInteraction} interaction - Discord interaction
 * @param {string} sheetId - Chainsheet ID
 */
async function showUpdateCountModal(interaction, sheetId) {
  try {
    // Get chainsheet
    const chainsheet = getChainsheet(interaction.guildId, sheetId);
    
    if (!chainsheet || !chainsheet.active) {
      return interaction.reply({
        content: '❌ Chainsheet not found or already closed.',
        ephemeral: true
      });
    }
    
    // Check if the user is the creator
    if (chainsheet.creatorId !== interaction.user.id && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Only the creator of the chainsheet or a server administrator can update the chain count.',
        ephemeral: true
      });
    }
    
    // Create modal
    const modal = new ModalBuilder()
      .setCustomId(`chainsheet_updateCount_${sheetId}`)
      .setTitle('Update Chain Count');
    
    // Add form input
    const countInput = new TextInputBuilder()
      .setCustomId('count')
      .setLabel('Current Chain Count')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(chainsheet.chainCount ? chainsheet.chainCount.toString() : '')
      .setPlaceholder('Enter the current chain count');
    
    // Add input to modal
    const countRow = new ActionRowBuilder().addComponents(countInput);
    
    modal.addComponents(countRow);
    
    // Show the modal
    await interaction.showModal(modal);
  } catch (error) {
    logError('Error showing update count modal:', error);
    
    await interaction.reply({
      content: '❌ An error occurred while showing the update form.',
      ephemeral: true
    });
  }
}

/**
 * Show close confirmation
 * @param {ButtonInteraction} interaction - Discord interaction
 * @param {string} sheetId - Chainsheet ID
 */
async function showCloseConfirmation(interaction, sheetId) {
  try {
    // Get chainsheet
    const chainsheet = getChainsheet(interaction.guildId, sheetId);
    
    if (!chainsheet || !chainsheet.active) {
      return interaction.reply({
        content: '❌ Chainsheet not found or already closed.',
        ephemeral: true
      });
    }
    
    // Check if the user is the creator
    if (chainsheet.creatorId !== interaction.user.id && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: '❌ Only the creator of the chainsheet or a server administrator can close it.',
        ephemeral: true
      });
    }
    
    // Create confirmation buttons
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`chainsheet_confirmClose_${sheetId}`)
          .setLabel('Yes, close it')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('chainsheet_cancelClose')
          .setLabel('No, keep it open')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.reply({
      content: `⚠️ Are you sure you want to close the chainsheet "${chainsheet.options.title || 'Chain Sign-up Sheet'}"?\n\nThis will stop the live updates and prevent further signups. Participants will no longer receive reminders.`,
      components: [row],
      ephemeral: true
    });
  } catch (error) {
    logError('Error showing close confirmation:', error);
    
    await interaction.reply({
      content: '❌ An error occurred while showing the confirmation.',
      ephemeral: true
    });
  }
}

/**
 * Handle modal signup submission
 * @param {ModalSubmitInteraction} interaction - Discord modal interaction
 * @param {Client} client - Discord client
 * @param {string} sheetId - Chainsheet ID
 */
async function handleModalSignup(interaction, client, sheetId) {
  try {
    // Get form values
    const startTime = interaction.fields.getTextInputValue('startTime');
    const endTime = interaction.fields.getTextInputValue('endTime');
    const timezone = interaction.fields.getTextInputValue('timezone');
    
    // Validate time format
    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
      return interaction.reply({
        content: '❌ Invalid time format. Please use the format HH:MM (e.g., 14:30 for 2:30 PM).',
        ephemeral: true
      });
    }
    
    // Get chainsheet
    const chainsheet = getChainsheet(interaction.guildId, sheetId);
    
    if (!chainsheet || !chainsheet.active) {
      return interaction.reply({
        content: '❌ Chainsheet not found or already closed.',
        ephemeral: true
      });
    }
    
    // Process signup
    const updatedSheet = addParticipant(
      interaction.guildId,
      sheetId,
      interaction.user.id,
      startTime,
      endTime,
      timezone
    );
    
    if (!updatedSheet) {
      return interaction.reply({
        content: '❌ Failed to sign up. Please try again later.',
        ephemeral: true
      });
    }
    
    await interaction.reply({
      content: `✅ You've successfully signed up for the chainsheet "${chainsheet.options.title || 'Chain Sign-up Sheet'}" from ${startTime} to ${endTime} ${timezone}. Your time has been converted to Torn City time (UTC) and added to the sheet. You'll receive a reminder when your shift starts.`,
      ephemeral: true
    });
  } catch (error) {
    logError('Error handling modal signup:', error);
    
    await interaction.reply({
      content: '❌ An error occurred while processing your signup.',
      ephemeral: true
    });
  }
}

/**
 * Handle modal update chain count submission
 * @param {ModalSubmitInteraction} interaction - Discord modal interaction
 * @param {Client} client - Discord client
 * @param {string} sheetId - Chainsheet ID
 */
async function handleModalUpdateCount(interaction, client, sheetId) {
  try {
    // Get form value
    const countInput = interaction.fields.getTextInputValue('count');
    
    // Validate count
    const count = parseInt(countInput.trim().replace(/,/g, ''), 10);
    
    if (isNaN(count) || count < 0) {
      return interaction.reply({
        content: '❌ Invalid chain count. Please enter a valid number.',
        ephemeral: true
      });
    }
    
    // Get chainsheet
    const chainsheet = getChainsheet(interaction.guildId, sheetId);
    
    if (!chainsheet || !chainsheet.active) {
      return interaction.reply({
        content: '❌ Chainsheet not found or already closed.',
        ephemeral: true
      });
    }
    
    // Update chain count
    updateChainCount(interaction.guildId, sheetId, count);
    
    await interaction.reply({
      content: `✅ Chain count updated to **${count.toLocaleString()}** for chainsheet "${chainsheet.options.title || 'Chain Sign-up Sheet'}"`,
      ephemeral: true
    });
  } catch (error) {
    logError('Error handling modal update count:', error);
    
    await interaction.reply({
      content: '❌ An error occurred while updating the chain count.',
      ephemeral: true
    });
  }
}

/**
 * Handle button withdraw
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 * @param {string} sheetId - Chainsheet ID
 */
async function handleButtonWithdraw(interaction, client, sheetId) {
  try {
    // Get chainsheet
    const chainsheet = getChainsheet(interaction.guildId, sheetId);
    
    if (!chainsheet) {
      return interaction.reply({
        content: '❌ Chainsheet not found.',
        ephemeral: true
      });
    }
    
    // Check if user is a participant
    const isParticipant = chainsheet.participants.some(p => p.userId === interaction.user.id);
    
    if (!isParticipant) {
      return interaction.reply({
        content: '❌ You are not signed up for this chainsheet.',
        ephemeral: true
      });
    }
    
    // Process withdrawal
    const updatedSheet = removeParticipant(
      interaction.guildId,
      sheetId,
      interaction.user.id
    );
    
    if (!updatedSheet) {
      return interaction.reply({
        content: '❌ Failed to withdraw. Please try again later.',
        ephemeral: true
      });
    }
    
    await interaction.reply({
      content: `✅ You've successfully withdrawn from the chainsheet "${chainsheet.options.title || 'Chain Sign-up Sheet'}"`,
      ephemeral: true
    });
  } catch (error) {
    logError('Error handling button withdraw:', error);
    
    await interaction.reply({
      content: '❌ An error occurred while processing your withdrawal.',
      ephemeral: true
    });
  }
}

/**
 * Handle confirm close
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 * @param {string} sheetId - Chainsheet ID
 */
async function handleConfirmClose(interaction, client, sheetId) {
  try {
    // Get chainsheet
    const chainsheet = getChainsheet(interaction.guildId, sheetId);
    
    if (!chainsheet || !chainsheet.active) {
      return interaction.update({
        content: '❌ Chainsheet not found or already closed.',
        components: [],
        ephemeral: true
      });
    }
    
    // Close chainsheet
    closeChainsheet(interaction.guildId, sheetId);
    
    // Try to update the chainsheet message
    try {
      // Get the channel and message
      const guild = await client.guilds.fetch(interaction.guildId).catch(() => null);
      if (guild) {
        const channel = await guild.channels.fetch(chainsheet.channelId).catch(() => null);
        if (channel) {
          const message = await channel.messages.fetch(chainsheet.messageId).catch(() => null);
          if (message) {
            // Update the message
            const embed = await createChainsheetEmbed(chainsheet, client);
            
            await message.edit({
              embeds: [embed],
              components: [],
              content: '**⚠️ This chainsheet has been closed and is no longer active**'
            }).catch(() => {});
          }
        }
      }
    } catch (error) {
      logError('Error updating chainsheet message after close:', error);
    }
    
    await interaction.update({
      content: `✅ Chainsheet "${chainsheet.options.title || 'Chain Sign-up Sheet'}" has been closed.`,
      components: [],
      ephemeral: true
    });
  } catch (error) {
    logError('Error handling confirm close:', error);
    
    await interaction.update({
      content: '❌ An error occurred while closing the chainsheet.',
      components: [],
      ephemeral: true
    });
  }
}

/**
 * Validate time format (HH:MM)
 * @param {string} timeStr - Time string
 * @returns {boolean} Whether the format is valid
 */
function isValidTimeFormat(timeStr) {
  // Check if timeStr matches the format HH:MM
  const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  return regex.test(timeStr);
}

module.exports = { chainsheetCommand };
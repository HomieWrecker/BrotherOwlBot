/**
 * Event management and countdown command for BrotherOwlManager
 * Allows users to create, view, and manage faction events with reminders
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatDate } = require('../utils/formatting');
const { BOT_CONFIG } = require('../config');
const { createEvent, updateEvent, deleteEvent, getEvent, getServerEvents, getUpcomingEvents, formatTimeRemaining } = require('../services/event-service');
const { getServerConfig, updateServerConfig, getServerConfigValue, hasRequiredConfig } = require('../services/server-config');
const crypto = require('crypto');

// Command creation
const eventsCommand = {
  data: new SlashCommandBuilder()
    .setName('events')
    .setDescription('Manage faction events and countdowns')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List upcoming faction events'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new faction event')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Event name')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('date')
            .setDescription('Event date and time (YYYY-MM-DD HH:MM or +XhYm for relative time)')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Event description')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View details of a specific event')
        .addStringOption(option =>
          option.setName('event_id')
            .setDescription('Event ID')
            .setRequired(true)
            .setAutocomplete(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete an event')
        .addStringOption(option =>
          option.setName('event_id')
            .setDescription('Event ID')
            .setRequired(true)
            .setAutocomplete(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up event notifications for the server')
        .addChannelOption(option =>
          option.setName('reminder_channel')
            .setDescription('Channel for event reminders')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('reminder_role')
            .setDescription('Role to mention for event reminders')
            .setRequired(false))),

  /**
   * Handle slash command execution
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Validate server configuration for most commands
      if (subcommand !== 'setup' && !hasRequiredConfig(interaction.guildId)) {
        return interaction.reply({
          content: "⚠️ This server hasn't been fully configured yet. An administrator needs to run `/faction setup` first.",
          ephemeral: true
        });
      }

      switch (subcommand) {
        case 'list':
          await handleListEvents(interaction, client);
          break;
        case 'create':
          await handleCreateEvent(interaction, client);
          break;
        case 'view':
          await handleViewEvent(interaction, client);
          break;
        case 'delete':
          await handleDeleteEvent(interaction, client);
          break;
        case 'setup':
          await handleSetupEvents(interaction, client);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown subcommand',
            ephemeral: true
          });
      }
    } catch (error) {
      logError('Error executing events command:', error);
      
      // Handle any uncaught errors
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: '❌ An error occurred while processing your request.',
          components: []
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: '❌ An error occurred while processing your request.',
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
      const [action, eventId] = interaction.customId.split('_').slice(1);
      
      switch (action) {
        case 'delete':
          // Confirm event deletion
          const confirmRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`event_confirmDelete_${eventId}`)
                .setLabel('Yes, delete it')
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId('event_cancelDelete')
                .setLabel('No, keep it')
                .setStyle(ButtonStyle.Secondary)
            );
          
          await interaction.reply({
            content: '⚠️ Are you sure you want to delete this event? This action cannot be undone.',
            components: [confirmRow],
            ephemeral: true
          });
          break;
          
        case 'confirmDelete':
          // Delete the event
          if (deleteEvent(interaction.guildId, eventId)) {
            await interaction.update({
              content: '✅ Event has been deleted.',
              components: [],
              ephemeral: true
            });
          } else {
            await interaction.update({
              content: '❌ Failed to delete event. It may have already been deleted.',
              components: [],
              ephemeral: true
            });
          }
          break;
          
        case 'cancelDelete':
          // Cancel deletion
          await interaction.update({
            content: '✅ Event deletion cancelled.',
            components: [],
            ephemeral: true
          });
          break;
          
        case 'edit':
          // Show edit modal
          const event = getEvent(interaction.guildId, eventId);
          if (!event) {
            await interaction.reply({
              content: '❌ Event not found.',
              ephemeral: true
            });
            return;
          }
          
          const modal = new ModalBuilder()
            .setCustomId(`event_editModal_${eventId}`)
            .setTitle('Edit Event');
            
          // Format date for display (YYYY-MM-DD HH:MM)
          const dateObj = new Date(event.date);
          const formattedDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
          
          // Add form inputs
          const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Event Name')
            .setStyle(TextInputStyle.Short)
            .setValue(event.name)
            .setRequired(true);
            
          const dateInput = new TextInputBuilder()
            .setCustomId('date')
            .setLabel('Date (YYYY-MM-DD HH:MM or +XhYm)')
            .setStyle(TextInputStyle.Short)
            .setValue(formattedDate)
            .setRequired(true);
            
          const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(event.description || '')
            .setRequired(false);
            
          // Add inputs to modal
          const nameRow = new ActionRowBuilder().addComponents(nameInput);
          const dateRow = new ActionRowBuilder().addComponents(dateInput);
          const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
          
          modal.addComponents(nameRow, dateRow, descriptionRow);
          
          await interaction.showModal(modal);
          break;
          
        default:
          await interaction.reply({
            content: '❌ Unknown action',
            ephemeral: true
          });
      }
    } catch (error) {
      logError('Error handling events button interaction:', error);
      
      // Handle any uncaught errors
      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
      }).catch(() => {});
    }
  },

  /**
   * Handle modal submissions
   * @param {ModalSubmitInteraction} interaction - Discord modal interaction
   * @param {Client} client - Discord client
   */
  async handleModal(interaction, client) {
    try {
      const [action, eventId] = interaction.customId.split('_').slice(1);
      
      switch (action) {
        case 'editModal':
          // Get the values from the modal
          const name = interaction.fields.getTextInputValue('name');
          const dateInput = interaction.fields.getTextInputValue('date');
          const description = interaction.fields.getTextInputValue('description');
          
          // Parse the date
          let eventDate;
          
          // Check if it's a relative time (+XhYm format)
          if (dateInput.startsWith('+')) {
            const relativeTime = parseRelativeTime(dateInput);
            if (!relativeTime) {
              await interaction.reply({
                content: '❌ Invalid date format. Use YYYY-MM-DD HH:MM or +XhYm.',
                ephemeral: true
              });
              return;
            }
            
            eventDate = new Date(Date.now() + relativeTime);
          } else {
            // Try to parse as YYYY-MM-DD HH:MM
            eventDate = new Date(dateInput.replace(' ', 'T'));
            
            if (isNaN(eventDate.getTime())) {
              await interaction.reply({
                content: '❌ Invalid date format. Use YYYY-MM-DD HH:MM or +XhYm.',
                ephemeral: true
              });
              return;
            }
          }
          
          // Update the event
          if (updateEvent(interaction.guildId, eventId, {
            name,
            date: eventDate,
            description
          })) {
            // Get the updated event
            const event = getEvent(interaction.guildId, eventId);
            
            // Create embed to show the updated event
            const embed = createEventEmbed(event);
            
            // Create action buttons
            const row = createEventActionRow(eventId);
            
            await interaction.reply({
              content: '✅ Event updated successfully!',
              embeds: [embed],
              components: [row],
              ephemeral: true
            });
          } else {
            await interaction.reply({
              content: '❌ Failed to update event. It may have been deleted.',
              ephemeral: true
            });
          }
          break;
          
        default:
          await interaction.reply({
            content: '❌ Unknown action',
            ephemeral: true
          });
      }
    } catch (error) {
      logError('Error handling events modal submission:', error);
      
      // Handle any uncaught errors
      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
      }).catch(() => {});
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
      
      if (focusedOption.name === 'event_id') {
        // Get all events for this server
        const serverEvents = getServerEvents(interaction.guildId);
        
        // Filter by partial matches on ID or name
        const filtered = serverEvents
          .filter(event => 
            event.id.includes(focusedOption.value) || 
            event.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25); // Max 25 choices
          
        // Format for autocomplete
        const choices = filtered.map(event => ({
          name: `${event.name} (${formatDate(event.date)})`,
          value: event.id
        }));
        
        await interaction.respond(choices);
      }
    } catch (error) {
      logError('Error handling events autocomplete:', error);
      await interaction.respond([]).catch(() => {});
    }
  }
};

/**
 * Handle the list events subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleListEvents(interaction, client) {
  // Get upcoming events
  const events = getUpcomingEvents(interaction.guildId);
  
  if (events.length === 0) {
    await interaction.reply({
      content: '📅 There are no upcoming events scheduled.',
      ephemeral: true
    });
    return;
  }
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('📅 Upcoming Faction Events')
    .setColor(BOT_CONFIG.color)
    .setDescription(`Here are the next ${events.length} upcoming events:`)
    .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Use /events view to see details` });
  
  // Add each event
  events.forEach((event, index) => {
    const timeRemaining = formatTimeRemaining(event.date);
    
    embed.addFields({
      name: `${index + 1}. ${event.name}`,
      value: `**When:** ${formatDate(event.date)}\n**Time remaining:** ${timeRemaining}\n**ID:** \`${event.id}\``,
      inline: false
    });
  });
  
  await interaction.reply({
    embeds: [embed]
  });
}

/**
 * Handle the create event subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleCreateEvent(interaction, client) {
  // Get event details from command options
  const name = interaction.options.getString('name');
  const dateInput = interaction.options.getString('date');
  const description = interaction.options.getString('description') || 'No description provided';
  
  // Parse the date
  let eventDate;
  
  // Check if it's a relative time (+XhYm format)
  if (dateInput.startsWith('+')) {
    const relativeTime = parseRelativeTime(dateInput);
    if (!relativeTime) {
      await interaction.reply({
        content: '❌ Invalid date format. Use YYYY-MM-DD HH:MM or +XhYm.',
        ephemeral: true
      });
      return;
    }
    
    eventDate = new Date(Date.now() + relativeTime);
  } else {
    // Try to parse as YYYY-MM-DD HH:MM
    eventDate = new Date(dateInput.replace(' ', 'T'));
    
    if (isNaN(eventDate.getTime())) {
      await interaction.reply({
        content: '❌ Invalid date format. Use YYYY-MM-DD HH:MM or +XhYm.',
        ephemeral: true
      });
      return;
    }
  }
  
  // Check that the date is in the future
  if (eventDate <= new Date()) {
    await interaction.reply({
      content: '❌ Event date must be in the future.',
      ephemeral: true
    });
    return;
  }
  
  // Create a unique ID for the event
  const eventId = crypto.randomBytes(4).toString('hex');
  
  // Create the event
  if (createEvent(
    interaction.guildId,
    eventId,
    name,
    eventDate,
    description,
    interaction.user.id
  )) {
    // Get event for display
    const event = getEvent(interaction.guildId, eventId);
    
    // Create embed
    const embed = createEventEmbed(event);
    
    // Create action buttons
    const row = createEventActionRow(eventId);
    
    await interaction.reply({
      content: '✅ Event created successfully!',
      embeds: [embed],
      components: [row]
    });
  } else {
    await interaction.reply({
      content: '❌ Failed to create event. Please try again.',
      ephemeral: true
    });
  }
}

/**
 * Handle the view event subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleViewEvent(interaction, client) {
  // Get event ID from command options
  const eventId = interaction.options.getString('event_id');
  
  // Get the event
  const event = getEvent(interaction.guildId, eventId);
  
  if (!event) {
    await interaction.reply({
      content: '❌ Event not found.',
      ephemeral: true
    });
    return;
  }
  
  // Create embed
  const embed = createEventEmbed(event);
  
  // Create action buttons
  const row = createEventActionRow(eventId);
  
  await interaction.reply({
    embeds: [embed],
    components: [row]
  });
}

/**
 * Handle the delete event subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleDeleteEvent(interaction, client) {
  // Get event ID from command options
  const eventId = interaction.options.getString('event_id');
  
  // Get the event
  const event = getEvent(interaction.guildId, eventId);
  
  if (!event) {
    await interaction.reply({
      content: '❌ Event not found.',
      ephemeral: true
    });
    return;
  }
  
  // Check permissions
  if (event.creatorId !== interaction.user.id && 
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    await interaction.reply({
      content: '❌ You don\'t have permission to delete this event. Only the creator or administrators can delete events.',
      ephemeral: true
    });
    return;
  }
  
  // Confirm deletion
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`event_confirmDelete_${eventId}`)
        .setLabel('Yes, delete it')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('event_cancelDelete')
        .setLabel('No, keep it')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.reply({
    content: `⚠️ Are you sure you want to delete the event **${event.name}**? This action cannot be undone.`,
    components: [row],
    ephemeral: true
  });
}

/**
 * Handle the setup events subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleSetupEvents(interaction, client) {
  // Check permissions
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    await interaction.reply({
      content: '❌ You need the "Manage Server" permission to set up event notifications.',
      ephemeral: true
    });
    return;
  }
  
  // Get options
  const reminderChannel = interaction.options.getChannel('reminder_channel');
  const reminderRole = interaction.options.getRole('reminder_role');
  
  // Update server configuration
  const eventConfig = {
    reminderChannelId: reminderChannel.id,
    reminderRoleId: reminderRole ? reminderRole.id : null
  };
  
  if (updateServerConfig(interaction.guildId, 'eventConfig', eventConfig)) {
    await interaction.reply({
      content: `✅ Event notifications set up successfully!\n\nReminders will be sent to ${reminderChannel}${reminderRole ? ` and will mention ${reminderRole}` : ''}.`,
      ephemeral: true
    });
  } else {
    await interaction.reply({
      content: '❌ Failed to set up event notifications. Please make sure your server is fully configured with `/faction setup` first.',
      ephemeral: true
    });
  }
}

/**
 * Create an embed for an event
 * @param {Object} event - Event object
 * @returns {EmbedBuilder} Embed for the event
 */
function createEventEmbed(event) {
  const timeRemaining = formatTimeRemaining(event.date);
  
  return new EmbedBuilder()
    .setTitle(`📅 Event: ${event.name}`)
    .setColor(BOT_CONFIG.color)
    .setDescription(event.description)
    .addFields(
      { name: 'When', value: formatDate(event.date), inline: true },
      { name: 'Time Remaining', value: timeRemaining, inline: true },
      { name: 'Created by', value: `<@${event.creatorId}>`, inline: true },
      { name: 'Event ID', value: `\`${event.id}\``, inline: true }
    )
    .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
    .setTimestamp();
}

/**
 * Create action row for event actions
 * @param {string} eventId - Event ID
 * @returns {ActionRowBuilder} Action row with buttons
 */
function createEventActionRow(eventId) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`event_edit_${eventId}`)
        .setLabel('Edit')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✏️'),
      new ButtonBuilder()
        .setCustomId(`event_delete_${eventId}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );
}

/**
 * Parse relative time string (+XhYm format)
 * @param {string} timeStr - Relative time string
 * @returns {number|null} Milliseconds or null if invalid
 */
function parseRelativeTime(timeStr) {
  try {
    // Must start with +
    if (!timeStr.startsWith('+')) return null;
    
    let milliseconds = 0;
    timeStr = timeStr.substring(1);
    
    // Match hours
    const hourMatch = timeStr.match(/(\d+)h/);
    if (hourMatch) {
      milliseconds += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
    }
    
    // Match minutes
    const minuteMatch = timeStr.match(/(\d+)m/);
    if (minuteMatch) {
      milliseconds += parseInt(minuteMatch[1], 10) * 60 * 1000;
    }
    
    // Match days
    const dayMatch = timeStr.match(/(\d+)d/);
    if (dayMatch) {
      milliseconds += parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000;
    }
    
    return milliseconds > 0 ? milliseconds : null;
  } catch (error) {
    return null;
  }
}

module.exports = { eventsCommand };
/**
 * Event management and countdown command for Brother Owl
 * Allows users to create, view, and manage faction events with reminders
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatDate } = require('../utils/formatting');
const { BOT_CONFIG } = require('../config');
const crypto = require('crypto');

// Initialize services after they're loaded in the bot
let eventService, serverConfig;

try {
  eventService = require('../services/event-service');
  serverConfig = require('../services/server-config');
} catch (error) {
  logError('Error loading services for events command:', error);
}

// Command creation
module.exports = {
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
        .addIntegerOption(option =>
          option.setName('hours')
            .setDescription('Hours until event (0-24)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(24))
        .addIntegerOption(option =>
          option.setName('minutes')
            .setDescription('Minutes until event (0-59)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(59))
        .addIntegerOption(option =>
          option.setName('days')
            .setDescription('Days until event (0-30)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(30))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Event description')
            .setRequired(false))
        .addIntegerOption(option =>
          option.setName('max_participants')
            .setDescription('Maximum number of participants (0 for unlimited)')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(100)))
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
        .setName('signup')
        .setDescription('Sign up for an event')
        .addStringOption(option =>
          option.setName('event_id')
            .setDescription('Event ID')
            .setRequired(true)
            .setAutocomplete(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('withdraw')
        .setDescription('Withdraw from an event')
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
        .addStringOption(option =>
          option.setName('faction_id')
            .setDescription('Your Torn faction ID')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('api_key')
            .setDescription('A Torn API key with faction access')
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
      // Make sure services are loaded
      if (!eventService || !serverConfig) {
        eventService = require('../services/event-service');
        serverConfig = require('../services/server-config');
      }
      
      const subcommand = interaction.options.getSubcommand();
      
      // Validate server configuration for most commands
      if (subcommand !== 'setup' && !serverConfig.hasRequiredConfig(interaction.guildId)) {
        return interaction.reply({
          content: "⚠️ This server hasn't been fully configured yet. An administrator needs to run `/events setup` first.",
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
        case 'signup':
          await handleSignupEvent(interaction, client);
          break;
        case 'withdraw':
          await handleWithdrawEvent(interaction, client);
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
      // Make sure services are loaded
      if (!eventService || !serverConfig) {
        eventService = require('../services/event-service');
        serverConfig = require('../services/server-config');
      }
      
      // Check if this is an event-related button
      if (!interaction.customId.startsWith('event_')) {
        return false;
      }
      
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
          if (eventService.deleteEvent(interaction.guildId, eventId)) {
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
          
        case 'signup':
          // Sign up for an event
          const signupEvent = eventService.getEvent(interaction.guildId, eventId);
          if (!signupEvent) {
            await interaction.reply({
              content: '❌ Event not found.',
              ephemeral: true
            });
            return true;
          }
          
          // Check if event is in the past
          if (new Date(signupEvent.date) < new Date()) {
            await interaction.reply({
              content: '❌ Cannot sign up for past events',
              ephemeral: true
            });
            return true;
          }
          
          // Check if the user is already a participant
          const isAlreadyParticipant = signupEvent.participants && 
            signupEvent.participants.some(p => p.id === interaction.user.id);
          
          if (isAlreadyParticipant) {
            await interaction.reply({
              content: '❌ You are already signed up for this event',
              ephemeral: true
            });
            return true;
          }
          
          // Check if the event is at capacity
          const isEventFull = signupEvent.maxParticipants > 0 && 
            signupEvent.participants && 
            signupEvent.participants.length >= signupEvent.maxParticipants;
          
          if (isEventFull) {
            await interaction.reply({
              content: '❌ This event is at capacity',
              ephemeral: true
            });
            return true;
          }
          
          // Add the user to the participants list
          const signupSuccess = eventService.addParticipant(
            interaction.guildId,
            eventId,
            interaction.user.id,
            interaction.user.username
          );
          
          if (signupSuccess) {
            // Get the updated event
            const updatedSignupEvent = eventService.getEvent(interaction.guildId, eventId);
            
            // Create embed to show the event
            const signupEmbed = createEventEmbed(updatedSignupEvent);
            
            // Check if the user is the creator of the event
            const isCreatorSignup = updatedSignupEvent.creatorId === interaction.user.id;
            
            // Create action buttons based on user's relation to the event
            const signupRows = createEventActionRows(eventId, isCreatorSignup, true, false);
            
            await interaction.reply({
              content: `✅ You have successfully signed up for the event: **${updatedSignupEvent.name}**`,
              embeds: [signupEmbed],
              components: signupRows
            });
          } else {
            await interaction.reply({
              content: '❌ There was an error signing up for the event',
              ephemeral: true
            });
          }
          break;
          
        case 'withdraw':
          // Withdraw from an event
          const withdrawEvent = eventService.getEvent(interaction.guildId, eventId);
          if (!withdrawEvent) {
            await interaction.reply({
              content: '❌ Event not found.',
              ephemeral: true
            });
            return true;
          }
          
          // Check if event is in the past
          if (new Date(withdrawEvent.date) < new Date()) {
            await interaction.reply({
              content: '❌ Cannot withdraw from past events',
              ephemeral: true
            });
            return true;
          }
          
          // Check if the user is a participant
          const isParticipantWithdraw = withdrawEvent.participants && 
            withdrawEvent.participants.some(p => p.id === interaction.user.id);
          
          if (!isParticipantWithdraw) {
            await interaction.reply({
              content: '❌ You are not signed up for this event',
              ephemeral: true
            });
            return true;
          }
          
          // Remove the user from the participants list
          const withdrawSuccess = eventService.removeParticipant(
            interaction.guildId,
            eventId,
            interaction.user.id
          );
          
          if (withdrawSuccess) {
            // Get the updated event
            const updatedWithdrawEvent = eventService.getEvent(interaction.guildId, eventId);
            
            // Create embed to show the event
            const withdrawEmbed = createEventEmbed(updatedWithdrawEvent);
            
            // Check if the user is the creator of the event
            const isCreatorWithdraw = updatedWithdrawEvent.creatorId === interaction.user.id;
            
            // Create action buttons based on user's relation to the event
            const withdrawRows = createEventActionRows(eventId, isCreatorWithdraw, false, false);
            
            await interaction.reply({
              content: `✅ You have successfully withdrawn from the event: **${updatedWithdrawEvent.name}**`,
              embeds: [withdrawEmbed],
              components: withdrawRows
            });
          } else {
            await interaction.reply({
              content: '❌ There was an error withdrawing from the event',
              ephemeral: true
            });
          }
          break;
          
        case 'refresh':
          // Refresh event view
          const refreshEvent = eventService.getEvent(interaction.guildId, eventId);
          if (!refreshEvent) {
            await interaction.reply({
              content: '❌ Event not found.',
              ephemeral: true
            });
            return true;
          }
          
          // Create embed to show the event
          const refreshEmbed = createEventEmbed(refreshEvent);
          
          // Check if the user is the creator of the event
          const isCreatorRefresh = refreshEvent.creatorId === interaction.user.id;
          
          // Check if the user is a participant
          const isParticipantRefresh = refreshEvent.participants && 
            refreshEvent.participants.some(p => p.id === interaction.user.id);
            
          // Check if the event is at capacity
          const isFullRefresh = refreshEvent.maxParticipants > 0 && 
            refreshEvent.participants && 
            refreshEvent.participants.length >= refreshEvent.maxParticipants;
          
          // Create action buttons based on user's relation to the event
          const refreshRows = createEventActionRows(eventId, isCreatorRefresh, isParticipantRefresh, isFullRefresh);
          
          await interaction.reply({
            content: `📅 Event refreshed: **${refreshEvent.name}**`,
            embeds: [refreshEmbed],
            components: refreshRows
          });
          break;
        
        case 'edit':
          // Show edit modal
          const event = eventService.getEvent(interaction.guildId, eventId);
          if (!event) {
            await interaction.reply({
              content: '❌ Event not found.',
              ephemeral: true
            });
            return true;
          }
          
          const modal = new ModalBuilder()
            .setCustomId(`event_editModal_${eventId}`)
            .setTitle('Edit Event');
          
          // Add form inputs
          const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Event Name')
            .setStyle(TextInputStyle.Short)
            .setValue(event.name)
            .setRequired(true);
          
          // Time inputs - we'll use short fields for days, hours, minutes
          const daysInput = new TextInputBuilder()
            .setCustomId('days')
            .setLabel('Days (0-30)')
            .setStyle(TextInputStyle.Short)
            .setValue('0')
            .setPlaceholder('Enter days until event (0-30)')
            .setRequired(false);
            
          const hoursInput = new TextInputBuilder()
            .setCustomId('hours')
            .setLabel('Hours (0-24)')
            .setStyle(TextInputStyle.Short)
            .setValue('0')
            .setPlaceholder('Enter hours until event (0-24)')
            .setRequired(true);
            
          const minutesInput = new TextInputBuilder()
            .setCustomId('minutes')
            .setLabel('Minutes (0-59)')
            .setStyle(TextInputStyle.Short)
            .setValue('0')
            .setPlaceholder('Enter minutes until event (0-59)')
            .setRequired(true);
            
          const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(event.description || '')
            .setRequired(false);
            
          // Add inputs to modal
          const nameRow = new ActionRowBuilder().addComponents(nameInput);
          const daysRow = new ActionRowBuilder().addComponents(daysInput);
          const hoursRow = new ActionRowBuilder().addComponents(hoursInput);
          const minutesRow = new ActionRowBuilder().addComponents(minutesInput);
          const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
          
          modal.addComponents(nameRow, daysRow, hoursRow, minutesRow, descriptionRow);
          
          await interaction.showModal(modal);
          break;
          
        default:
          await interaction.reply({
            content: '❌ Unknown action',
            ephemeral: true
          });
      }
      
      return true;
    } catch (error) {
      logError('Error handling events button interaction:', error);
      
      // Handle any uncaught errors
      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
      }).catch(() => {});
      
      return true;
    }
  },

  /**
   * Handle modal submissions
   * @param {ModalSubmitInteraction} interaction - Discord modal interaction
   * @param {Client} client - Discord client
   */
  async handleModal(interaction, client) {
    try {
      // Make sure services are loaded
      if (!eventService || !serverConfig) {
        eventService = require('../services/event-service');
        serverConfig = require('../services/server-config');
      }
      
      // Check if this is an event-related modal
      if (!interaction.customId.startsWith('event_')) {
        return false;
      }
      
      const [action, eventId] = interaction.customId.split('_').slice(1);
      
      switch (action) {
        case 'editModal':
          // Get the values from the modal
          const name = interaction.fields.getTextInputValue('name');
          const description = interaction.fields.getTextInputValue('description');
          
          // Get time inputs as integers, with defaults if parsing fails
          let days = 0;
          let hours = 0;
          let minutes = 0;
          
          try {
            days = parseInt(interaction.fields.getTextInputValue('days')) || 0;
            hours = parseInt(interaction.fields.getTextInputValue('hours')) || 0;
            minutes = parseInt(interaction.fields.getTextInputValue('minutes')) || 0;
          } catch (error) {
            // Ignore parsing errors, we'll validate the values below
          }
          
          // Ensure values are within allowed ranges
          days = Math.max(0, Math.min(30, days));
          hours = Math.max(0, Math.min(24, hours));
          minutes = Math.max(0, Math.min(59, minutes));
          
          // Calculate total milliseconds
          const totalMilliseconds = 
            (days * 24 * 60 * 60 * 1000) + 
            (hours * 60 * 60 * 1000) + 
            (minutes * 60 * 1000);
          
          // Ensure at least some time is provided
          if (totalMilliseconds <= 0) {
            await interaction.reply({
              content: '❌ Event must be scheduled for the future. Please provide a valid time.',
              ephemeral: true
            });
            return true;
          }
          
          // Calculate event date based on the provided time units
          const eventDate = new Date(Date.now() + totalMilliseconds);
          
          // Update the event
          if (eventService.updateEvent(interaction.guildId, eventId, {
            name,
            date: eventDate,
            description
          })) {
            // Get the updated event
            const event = eventService.getEvent(interaction.guildId, eventId);
            
            // Create embed to show the updated event
            const embed = createEventEmbed(event);
            
            // Check if the user is the creator (they should be if editing)
            const isCreator = event.creatorId === interaction.user.id;
            
            // Check if the user is a participant
            const isParticipant = event.participants && 
              event.participants.some(p => p.id === interaction.user.id);
              
            // Check if the event is at capacity
            const isFull = event.maxParticipants > 0 && 
              event.participants && 
              event.participants.length >= event.maxParticipants;
            
            // Create action buttons
            const rows = createEventActionRows(eventId, isCreator, isParticipant, isFull);
            
            await interaction.reply({
              content: '✅ Event updated successfully!',
              embeds: [embed],
              components: rows,
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
      
      return true;
    } catch (error) {
      logError('Error handling events modal submission:', error);
      
      // Handle any uncaught errors
      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
      }).catch(() => {});
      
      return true;
    }
  },

  /**
   * Handle autocomplete interactions
   * @param {AutocompleteInteraction} interaction - Discord autocomplete interaction
   * @param {Client} client - Discord client
   */
  async handleAutocomplete(interaction, client) {
    try {
      // Make sure services are loaded
      if (!eventService || !serverConfig) {
        eventService = require('../services/event-service');
        serverConfig = require('../services/server-config');
      }
      
      const focusedOption = interaction.options.getFocused(true);
      
      if (focusedOption.name === 'event_id') {
        // Get all events for this server
        const serverEvents = eventService.getServerEvents(interaction.guildId);
        
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
      
      return true;
    } catch (error) {
      logError('Error handling events autocomplete:', error);
      await interaction.respond([]).catch(() => {});
      return true;
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
  const events = eventService.getUpcomingEvents(interaction.guildId);
  
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
    const timeRemaining = eventService.formatTimeRemaining(event.date);
    
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
  const hours = interaction.options.getInteger('hours');
  const minutes = interaction.options.getInteger('minutes');
  const days = interaction.options.getInteger('days') || 0;
  const description = interaction.options.getString('description') || 'No description provided';
  
  // Calculate total milliseconds
  const totalMilliseconds = 
    (days * 24 * 60 * 60 * 1000) + 
    (hours * 60 * 60 * 1000) + 
    (minutes * 60 * 1000);
  
  // Ensure at least some time is provided
  if (totalMilliseconds <= 0) {
    await interaction.reply({
      content: '❌ Event must be scheduled for the future. Please provide a valid time.',
      ephemeral: true
    });
    return;
  }
  
  // Calculate event date based on the provided time units
  const eventDate = new Date(Date.now() + totalMilliseconds);
  
  // Create a unique ID for the event
  const eventId = crypto.randomBytes(4).toString('hex');
  
  // Get max participants option
  const maxParticipants = interaction.options.getInteger('max_participants') || 0;
  
  // Create the event
  if (eventService.createEvent(
    interaction.guildId,
    eventId,
    name,
    eventDate,
    description,
    interaction.user.id,
    { maxParticipants }
  )) {
    // Get the event
    const event = eventService.getEvent(interaction.guildId, eventId);
    
    // Create embed to show the event
    const embed = createEventEmbed(event);
    
    // Create action buttons - creator is viewing so they have admin rights
    const rows = createEventActionRows(eventId, true, false, false);
    
    await interaction.reply({
      content: '✅ Event created successfully!',
      embeds: [embed],
      components: rows
    });
  } else {
    await interaction.reply({
      content: '❌ There was an error creating the event.',
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
  // Get the event ID
  const eventId = interaction.options.getString('event_id');
  
  // Get the event
  const event = eventService.getEvent(interaction.guildId, eventId);
  
  if (!event) {
    await interaction.reply({
      content: '❌ Event not found.',
      ephemeral: true
    });
    return;
  }
  
  // Create embed to show the event
  const embed = createEventEmbed(event);
  
  // Check if the user is the creator of the event
  const isCreator = event.creatorId === interaction.user.id;
  
  // Check if the user is a participant
  const isParticipant = event.participants && 
    event.participants.some(p => p.id === interaction.user.id);
  
  // Check if the event is at capacity
  const isFull = event.maxParticipants > 0 && 
    event.participants && 
    event.participants.length >= event.maxParticipants;
  
  // Create action buttons based on user's relation to the event
  const rows = createEventActionRows(eventId, isCreator, isParticipant, isFull);
  
  await interaction.reply({
    embeds: [embed],
    components: rows
  });
}

/**
 * Handle the signup event subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleSignupEvent(interaction, client) {
  const eventId = interaction.options.getString('event_id');
  
  // Get the event
  const event = eventService.getEvent(interaction.guildId, eventId);
  
  // Check if event exists
  if (!event) {
    await interaction.reply({
      content: '❌ Event not found',
      ephemeral: true
    });
    return;
  }
  
  // Check if event is in the past
  if (new Date(event.date) < new Date()) {
    await interaction.reply({
      content: '❌ Cannot sign up for past events',
      ephemeral: true
    });
    return;
  }
  
  // Check if the user is already a participant
  const isParticipant = event.participants && 
    event.participants.some(p => p.id === interaction.user.id);
  
  if (isParticipant) {
    await interaction.reply({
      content: '❌ You are already signed up for this event',
      ephemeral: true
    });
    return;
  }
  
  // Check if the event is at capacity
  const isFull = event.maxParticipants > 0 && 
    event.participants && 
    event.participants.length >= event.maxParticipants;
  
  if (isFull) {
    await interaction.reply({
      content: '❌ This event is at capacity',
      ephemeral: true
    });
    return;
  }
  
  // Add the user to the participants list
  const success = eventService.addParticipant(
    interaction.guildId,
    eventId,
    interaction.user.id,
    interaction.user.username
  );
  
  if (success) {
    // Get the updated event
    const updatedEvent = eventService.getEvent(interaction.guildId, eventId);
    
    // Create embed to show the event
    const embed = createEventEmbed(updatedEvent);
    
    // Check if the user is the creator of the event
    const isCreator = updatedEvent.creatorId === interaction.user.id;
    
    // Create action buttons based on user's relation to the event
    const rows = createEventActionRows(eventId, isCreator, true, false);
    
    await interaction.reply({
      content: `✅ You have successfully signed up for the event: **${updatedEvent.name}**`,
      embeds: [embed],
      components: rows
    });
  } else {
    await interaction.reply({
      content: '❌ There was an error signing up for the event',
      ephemeral: true
    });
  }
}

/**
 * Handle the withdraw event subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleWithdrawEvent(interaction, client) {
  const eventId = interaction.options.getString('event_id');
  
  // Get the event
  const event = eventService.getEvent(interaction.guildId, eventId);
  
  // Check if event exists
  if (!event) {
    await interaction.reply({
      content: '❌ Event not found',
      ephemeral: true
    });
    return;
  }
  
  // Check if event is in the past
  if (new Date(event.date) < new Date()) {
    await interaction.reply({
      content: '❌ Cannot withdraw from past events',
      ephemeral: true
    });
    return;
  }
  
  // Check if the user is a participant
  const isParticipant = event.participants && 
    event.participants.some(p => p.id === interaction.user.id);
  
  if (!isParticipant) {
    await interaction.reply({
      content: '❌ You are not signed up for this event',
      ephemeral: true
    });
    return;
  }
  
  // Remove the user from the participants list
  const success = eventService.removeParticipant(
    interaction.guildId,
    eventId,
    interaction.user.id
  );
  
  if (success) {
    // Get the updated event
    const updatedEvent = eventService.getEvent(interaction.guildId, eventId);
    
    // Create embed to show the event
    const embed = createEventEmbed(updatedEvent);
    
    // Check if the user is the creator of the event
    const isCreator = updatedEvent.creatorId === interaction.user.id;
    
    // Create action buttons based on user's relation to the event
    const rows = createEventActionRows(eventId, isCreator, false, false);
    
    await interaction.reply({
      content: `✅ You have successfully withdrawn from the event: **${updatedEvent.name}**`,
      embeds: [embed],
      components: rows
    });
  } else {
    await interaction.reply({
      content: '❌ There was an error withdrawing from the event',
      ephemeral: true
    });
  }
}

/**
 * Handle the delete event subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleDeleteEvent(interaction, client) {
  // Get the event ID
  const eventId = interaction.options.getString('event_id');
  
  // Get the event
  const event = eventService.getEvent(interaction.guildId, eventId);
  
  if (!event) {
    await interaction.reply({
      content: '❌ Event not found.',
      ephemeral: true
    });
    return;
  }
  
  // Create embed to show the event
  const embed = createEventEmbed(event);
  
  // Create confirm/cancel buttons
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`event_confirmDelete_${eventId}`)
        .setLabel('Delete Event')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('event_cancelDelete')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await interaction.reply({
    content: '⚠️ Are you sure you want to delete this event?',
    embeds: [embed],
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
  // Check if user has admin permissions
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need administrator permissions to set up event notifications.',
      ephemeral: true
    });
    return;
  }
  
  // Get options
  const reminderChannel = interaction.options.getChannel('reminder_channel');
  const reminderRole = interaction.options.getRole('reminder_role');
  const factionId = interaction.options.getString('faction_id');
  const apiKey = interaction.options.getString('api_key');
  
  // Check channel permissions
  if (!reminderChannel.permissionsFor(client.user).has(PermissionFlagsBits.SendMessages)) {
    await interaction.reply({
      content: `❌ I don't have permission to send messages in ${reminderChannel}.`,
      ephemeral: true
    });
    return;
  }
  
  // Validate faction ID (should be numeric)
  if (!/^\d+$/.test(factionId)) {
    await interaction.reply({
      content: '❌ Faction ID should be a number.',
      ephemeral: true
    });
    return;
  }
  
  // Validate API key format (should be alphanumeric and proper length)
  if (!/^[a-zA-Z0-9]{16,16}$/.test(apiKey)) {
    await interaction.reply({
      content: '❌ Invalid API key format. API keys are 16 characters long.',
      ephemeral: true
    });
    return;
  }
  
  // Get or create server config
  let config = serverConfig.getServerConfig(interaction.guildId);
  
  if (!config) {
    config = {
      guildId: interaction.guildId,
      eventConfig: {}
    };
  } else if (!config.eventConfig) {
    config.eventConfig = {};
  }
  
  // Update config with faction info
  config.factionId = factionId;
  config.factionApiKey = apiKey;
  
  // Update event-specific config
  config.eventConfig.reminderChannelId = reminderChannel.id;
  if (reminderRole) {
    config.eventConfig.reminderRoleId = reminderRole.id;
  } else {
    // Remove role if not provided
    delete config.eventConfig.reminderRoleId;
  }
  
  // Save config
  serverConfig.setServerConfig(interaction.guildId, config);
  
  // Respond
  await interaction.reply({
    content: `✅ Faction and event notifications set up successfully! Faction ID: ${factionId} has been configured and reminders will be sent to ${reminderChannel}${reminderRole ? ` and will mention ${reminderRole}` : ''}.`,
    ephemeral: true
  });
}

/**
 * Create an embed for an event
 * @param {Object} event - Event object
 * @returns {EmbedBuilder} Discord embed
 */
function createEventEmbed(event) {
  const timeRemaining = eventService.formatTimeRemaining(event.date);
  const tornTime = eventService.toTornTime(event.date);
  const participants = event.participants || [];
  
  const embed = new EmbedBuilder()
    .setTitle(`📅 ${event.name}`)
    .setColor(BOT_CONFIG.color)
    .setDescription(event.description || 'No description provided')
    .addFields(
      { name: 'Date', value: formatDate(event.date), inline: true },
      { name: 'Torn City Time', value: tornTime, inline: true },
      { name: 'Time Remaining', value: timeRemaining, inline: true },
      { name: 'Created by', value: `<@${event.creatorId}>`, inline: true }
    )
    .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Event ID: ${event.id}` })
    .setTimestamp();
  
  // Add maximum participants if set
  if (event.maxParticipants > 0) {
    embed.addFields({
      name: 'Capacity',
      value: `${participants.length}/${event.maxParticipants} participants`,
      inline: true
    });
  } else {
    embed.addFields({
      name: 'Participants',
      value: `${participants.length} signed up`,
      inline: true
    });
  }
  
  // Add participants list if any
  if (participants.length > 0) {
    const participantsList = participants
      .map((p, index) => `${index + 1}. <@${p.id}> (${p.name})`)
      .join('\n');
    
    embed.addFields({
      name: 'Signup List',
      value: participantsList.substring(0, 1024) // Discord field value limit is 1024 characters
    });
    
    // If there are too many participants to fit in one field
    if (participantsList.length > 1024) {
      const remainingParticipants = participants.slice(Math.floor(1024 / 50)); // Rough estimate of how many fit in first field
      const additionalList = remainingParticipants
        .map((p, index) => `${index + Math.floor(1024 / 50) + 1}. <@${p.id}> (${p.name})`)
        .join('\n');
      
      embed.addFields({
        name: 'Signup List (continued)',
        value: additionalList.substring(0, 1024)
      });
    }
  } else {
    embed.addFields({
      name: 'Signup List',
      value: 'No participants yet. Be the first to sign up!'
    });
  }
  
  return embed;
}

/**
 * Create action buttons for an event
 * @param {string} eventId - Event ID
 * @param {boolean} isCreator - Whether the user is the creator of the event
 * @param {boolean} isParticipant - Whether the user is already signed up
 * @param {boolean} isFull - Whether the event is at capacity
 * @returns {ActionRowBuilder[]} Discord action rows
 */
function createEventActionRows(eventId, isCreator = false, isParticipant = false, isFull = false) {
  // Admin/creator buttons
  const adminRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`event_edit_${eventId}`)
        .setLabel('Edit Event')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!isCreator),
      new ButtonBuilder()
        .setCustomId(`event_delete_${eventId}`)
        .setLabel('Delete Event')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!isCreator)
    );
  
  // Participation buttons
  const participationRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`event_signup_${eventId}`)
        .setLabel('Sign Up')
        .setStyle(ButtonStyle.Success)
        .setDisabled(isParticipant || isFull),
      new ButtonBuilder()
        .setCustomId(`event_withdraw_${eventId}`)
        .setLabel('Withdraw')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isParticipant),
      new ButtonBuilder()
        .setCustomId(`event_refresh_${eventId}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
    );
  
  return [adminRow, participationRow];
}
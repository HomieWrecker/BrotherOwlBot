const { Client, GatewayIntentBits, ActivityType, Events, Collection } = require('discord.js');
const { registerCommands } = require('./commands/index');
const { log, logError } = require('./utils/logger');
const { BOT_CONFIG } = require('./config');
const path = require('path');
const fs = require('fs');

// Load services
let welcomeService = null;
let rolePermissions = null;
let giveawayService = null;
let eventService = null;

try {
  welcomeService = require('./services/welcome-service');
  log('Welcome service loaded');
} catch (error) {
  logError('Error loading welcome service:', error);
}

try {
  rolePermissions = require('./services/role-permissions');
  log('Role permissions service loaded');
} catch (error) {
  logError('Error loading role permissions service:', error);
}

try {
  giveawayService = require('./services/giveaway-service');
  log('Giveaway service loaded');
} catch (error) {
  logError('Error loading giveaway service:', error);
}

try {
  eventService = require('./services/event-service');
  log('Event service loaded');
} catch (error) {
  logError('Error loading event service:', error);
}

// Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // Additional intents for welcome system
    GatewayIntentBits.GuildMembers, // Needed to detect member join/leave events
    // Additional intents for giveaway system
    GatewayIntentBits.GuildMessageReactions, // Needed for reaction-based giveaways
    GatewayIntentBits.DirectMessages // Needed for DM notifications
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION'] // Required for reaction events on uncached messages
});

// Initialize commands collection
client.commands = new Collection();

/**
 * Starts the Discord bot and connects all services
 */
function startBot() {
  // Handle bot ready event
  client.once(Events.ClientReady, async () => {
    log(`Logged in as ${client.user.tag}`);
    
    // Set bot activity
    client.user.setActivity(`Torn Factions | ${BOT_CONFIG.name}`, { type: ActivityType.Watching });
    
    // Register slash commands
    try {
      await registerCommands(client);
      log('Slash commands registered successfully');
    } catch (error) {
      logError('Failed to register slash commands:', error);
    }
    
    // Initialize welcome service if available
    if (welcomeService && welcomeService.initWelcomeService) {
      try {
        welcomeService.initWelcomeService(client);
        log('Welcome service initialized');
      } catch (error) {
        logError('Failed to initialize welcome service:', error);
      }
    }
    
    // Initialize giveaway service if available
    if (giveawayService && giveawayService.initializeGiveawayService) {
      try {
        await giveawayService.initializeGiveawayService(client);
        log('Giveaway service initialized');
      } catch (error) {
        logError('Failed to initialize giveaway service:', error);
      }
    }
    
    // Initialize event service if available
    if (eventService && eventService.initEventService) {
      try {
        // Store client for event service to use for reminders
        global.discordClient = client;
        eventService.initEventService(client);
        log('Event service initialized');
      } catch (error) {
        logError('Failed to initialize event service:', error);
      }
    }
  });

  // Handle slash command interactions
  client.on(Events.InteractionCreate, async (interaction) => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      
      if (!command) {
        log(`Command not found: ${interaction.commandName}`);
        return;
      }
      
      try {
        // Check permissions if role permissions service is available
        if (rolePermissions && interaction.guild) {
          const member = interaction.member;
          
          // Skip permission check for botpermissions command (admin only)
          if (interaction.commandName !== 'botpermissions') {
            const userRoleIds = member.roles.cache.map(role => role.id);
            const hasPermission = await rolePermissions.hasPermission(
              interaction.guildId, 
              userRoleIds, 
              interaction.commandName
            );
            
            if (!hasPermission) {
              await interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
              });
              return;
            }
          }
        }
        
        log(`Executing command: ${interaction.commandName}`);
        await command.execute(interaction, client);
      } catch (error) {
        logError(`Error executing ${interaction.commandName} command:`, error);
        
        // Handle errors in responding to the interaction
        const errorResponse = {
          content: '❌ There was an error while executing this command.',
          ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorResponse).catch(err => 
            logError('Error sending error followUp:', err)
          );
        } else {
          await interaction.reply(errorResponse).catch(err => 
            logError('Error sending error reply:', err)
          );
        }
      }
      return;
    }
    
    // Handle button interactions
    if (interaction.isButton()) {
      try {
        // Handle welcome-related buttons
        if (interaction.customId.startsWith('welcome_')) {
          // Try to find welcome command
          const welcomeCommand = client.commands.get('welcome');
          if (welcomeCommand && welcomeCommand.handleButton) {
            // Use a separate try-catch to ensure welcome buttons don't affect other functionality
            try {
              await welcomeCommand.handleButton(interaction, client);
            } catch (welcomeError) {
              logError('Error in welcome button handler (isolated):', welcomeError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this welcome action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle API key-related buttons
        else if (interaction.customId.startsWith('apikey_')) {
          // Try to find apikey command
          const apikeyCommand = client.commands.get('apikey');
          if (apikeyCommand && apikeyCommand.handleButton) {
            // Use a separate try-catch to ensure API key buttons don't affect other functionality
            try {
              await apikeyCommand.handleButton(interaction, client);
            } catch (apikeyError) {
              logError('Error in API key button handler (isolated):', apikeyError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this API key action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle faction info-related buttons
        else if (interaction.customId.startsWith('factioninfo_')) {
          // Try to find factioninfo command
          const factionInfoCommand = client.commands.get('factioninfo');
          if (factionInfoCommand && factionInfoCommand.handleButton) {
            // Use a separate try-catch to ensure faction info buttons don't affect other functionality
            try {
              await factionInfoCommand.handleButton(interaction, client);
            } catch (factionInfoError) {
              logError('Error in faction info button handler (isolated):', factionInfoError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this faction info action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle permissions-related buttons
        else if (interaction.customId.startsWith('permissions_')) {
          // Try to find botpermissions command
          const botPermissionsCommand = client.commands.get('botpermissions');
          if (botPermissionsCommand && botPermissionsCommand.handleButton) {
            // Use a separate try-catch to ensure permissions buttons don't affect other functionality
            try {
              await botPermissionsCommand.handleButton(interaction, client);
            } catch (permissionsError) {
              logError('Error in permissions button handler (isolated):', permissionsError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this permissions action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle bank-related buttons
        else if (interaction.customId === 'bank_withdraw' || 
                 interaction.customId.startsWith('bank_fulfill_') || 
                 interaction.customId.startsWith('bank_cancel_')) {
          // Try to find bank command
          const bankCommand = client.commands.get('bank');
          if (bankCommand && bankCommand.handleButton) {
            // Use a separate try-catch to ensure bank buttons don't affect other functionality
            try {
              await bankCommand.handleButton(interaction, client);
            } catch (bankError) {
              logError('Error in bank button handler (isolated):', bankError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this bank action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle giveaway-related buttons
        else if (interaction.customId.startsWith('giveaway_')) {
          // Try to find giveaway command
          const giveawayCommand = client.commands.get('giveaway');
          if (giveawayCommand && giveawayCommand.handleButton) {
            // Use a separate try-catch to ensure giveaway buttons don't affect other functionality
            try {
              await giveawayCommand.handleButton(interaction, client);
            } catch (giveawayError) {
              logError('Error in giveaway button handler (isolated):', giveawayError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this giveaway action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle event-related buttons
        else if (interaction.customId.startsWith('event_')) {
          // Try to find events command
          const eventsCommand = client.commands.get('events');
          if (eventsCommand && eventsCommand.handleButton) {
            // Use a separate try-catch to ensure event buttons don't affect other functionality
            try {
              await eventsCommand.handleButton(interaction, client);
            } catch (eventError) {
              logError('Error in event button handler (isolated):', eventError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this event action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
      } catch (error) {
        logError('Error handling button interaction:', error);
      }
    }
    
    // Handle select menu interactions
    if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) {
      try {
        // Handle permissions-related select menus
        if (interaction.customId.startsWith('permissions_')) {
          // Try to find botpermissions command
          const botPermissionsCommand = client.commands.get('botpermissions');
          if (botPermissionsCommand && botPermissionsCommand.handleSelectMenu) {
            // Use a separate try-catch to ensure permissions select menus don't affect other functionality
            try {
              await botPermissionsCommand.handleSelectMenu(interaction, client);
            } catch (permissionsError) {
              logError('Error in permissions select menu handler (isolated):', permissionsError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this permissions action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle market-related select menus
        else if (interaction.customId.startsWith('market_')) {
          // Try to find market command
          const marketCommand = client.commands.get('market');
          if (marketCommand && marketCommand.handleSelectMenu) {
            // Use a separate try-catch to ensure market select menus don't affect other functionality
            try {
              await marketCommand.handleSelectMenu(interaction, client);
            } catch (marketError) {
              logError('Error in market select menu handler (isolated):', marketError);
              if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                  content: '❌ There was an error processing this market action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
      } catch (error) {
        logError('Error handling select menu interaction:', error);
      }
    }
    
    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      try {
        if (interaction.customId.startsWith('welcome_')) {
          // Try to find welcome command
          const welcomeCommand = client.commands.get('welcome');
          if (welcomeCommand && welcomeCommand.handleModal) {
            try {
              await welcomeCommand.handleModal(interaction, client);
            } catch (error) {
              logError('Error in welcome modal handler:', error);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your welcome form. This error has been logged.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        else if (interaction.customId.startsWith('apikey_')) {
          // Try to find apikey command
          const apikeyCommand = client.commands.get('apikey');
          if (apikeyCommand && apikeyCommand.handleModal) {
            try {
              await apikeyCommand.handleModal(interaction, client);
            } catch (error) {
              logError('Error in apikey modal handler:', error);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your API key. This error has been logged.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        else if (interaction.customId.startsWith('bank_withdraw_modal_')) {
          // Try to find bank command
          const bankCommand = client.commands.get('bank');
          if (bankCommand && bankCommand.handleModal) {
            try {
              await bankCommand.handleModal(interaction, client);
            } catch (error) {
              logError('Error in bank modal handler:', error);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your bank request. This error has been logged.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        else if (interaction.customId === 'giveaway_create_modal') {
          // Try to find giveaway command
          const giveawayCommand = client.commands.get('giveaway');
          if (giveawayCommand && giveawayCommand.handleModal) {
            try {
              await giveawayCommand.handleModal(interaction, client);
            } catch (error) {
              logError('Error in giveaway modal handler:', error);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your giveaway request. This error has been logged.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        else if (interaction.customId.startsWith('event_')) {
          // Try to find events command
          const eventsCommand = client.commands.get('events');
          if (eventsCommand && eventsCommand.handleModal) {
            try {
              await eventsCommand.handleModal(interaction, client);
            } catch (error) {
              logError('Error in events modal handler:', error);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your event request. This error has been logged.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
      } catch (error) {
        logError('Error handling modal submission:', error);
      }
    }
  });

  // Handle member join events (for welcome service)
  client.on(Events.GuildMemberAdd, async (member) => {
    if (welcomeService && welcomeService.handleMemberJoin) {
      try {
        await welcomeService.handleMemberJoin(member);
      } catch (error) {
        logError('Error in welcome service member join handler:', error);
      }
    }
  });

  // Handle member leave events (for welcome service)
  client.on(Events.GuildMemberRemove, async (member) => {
    if (welcomeService && welcomeService.handleMemberLeave) {
      try {
        await welcomeService.handleMemberLeave(member);
      } catch (error) {
        logError('Error in welcome service member leave handler:', error);
      }
    }
  });
  
  // Handle autocomplete interactions
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isAutocomplete()) return;
    
    try {
      // Handle events command autocomplete
      if (interaction.commandName === 'events') {
        const eventsCommand = client.commands.get('events');
        if (eventsCommand && eventsCommand.handleAutocomplete) {
          try {
            await eventsCommand.handleAutocomplete(interaction, client);
          } catch (error) {
            logError('Error in events autocomplete handler:', error);
            // Respond with empty options to prevent client-side errors
            await interaction.respond([]).catch(() => {});
          }
        }
      }
    } catch (error) {
      logError('Error handling autocomplete interaction:', error);
      // Respond with empty options to prevent client-side errors
      await interaction.respond([]).catch(() => {});
    }
  });
  
  // Handle reaction events for giveaways
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (giveawayService && giveawayService.handleReactionAdd) {
      try {
        // Partial reaction handling
        if (reaction.partial) {
          try {
            await reaction.fetch();
          } catch (error) {
            logError('Error fetching partial reaction:', error);
            return;
          }
        }
        
        await giveawayService.handleReactionAdd(reaction, user);
      } catch (error) {
        logError('Error handling reaction add for giveaway:', error);
      }
    }
  });
  
  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (giveawayService && giveawayService.handleReactionRemove) {
      try {
        // Partial reaction handling
        if (reaction.partial) {
          try {
            await reaction.fetch();
          } catch (error) {
            logError('Error fetching partial reaction:', error);
            return;
          }
        }
        
        await giveawayService.handleReactionRemove(reaction, user);
      } catch (error) {
        logError('Error handling reaction remove for giveaway:', error);
      }
    }
  });

  // Log in to Discord
  return client.login(process.env.DISCORD_TOKEN)
    .catch(error => {
      logError('Failed to log in to Discord:', error);
      throw error; // Re-throw to trigger process restart in index.js
    });
}

module.exports = { startBot };
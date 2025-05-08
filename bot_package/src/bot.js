const { Client, GatewayIntentBits, ActivityType, Events, Collection } = require('discord.js');
const { startTornWS } = require('./torn-ws');
const { registerCommands } = require('./commands/index');
const { log, logError } = require('./utils/logger');
const { BOT_CONFIG } = require('./config');
const path = require('path');
const fs = require('fs');

// Load optional services if available
let attackMonitor = null;
try {
  attackMonitor = require('./services/attack-monitor');
  log('Attack monitoring service loaded');
} catch (error) {
  // Silently continue if service isn't available
}

// Load event service if available
let eventService = null;
try {
  eventService = require('./services/event-service');
  log('Event service loaded');
} catch (error) {
  // Silently continue if service isn't available
}

// Load chainsheet service if available
let chainsheetService = null;
try {
  chainsheetService = require('./services/chainsheet-service');
  log('Chainsheet service loaded');
} catch (error) {
  // Silently continue if service isn't available
}

// Load welcome service if available
let welcomeService = null;
try {
  welcomeService = require('./services/welcome-service');
  log('Welcome service loaded');
} catch (error) {
  // Silently continue if service isn't available
}

// Load stats tracking service if available
let statsTrackingService = null;
try {
  statsTrackingService = require('./services/stats-tracking');
  log('Stats tracking service loaded');
} catch (error) {
  // Silently continue if service isn't available
}

// Load war countdown service if available
let warCountdownService = null;
try {
  warCountdownService = require('./services/war-countdown');
  log('War countdown service loaded');
} catch (error) {
  // Silently continue if service isn't available
}

// Load war strategy service if available
let warStrategyService = null;
try {
  warStrategyService = require('./services/war-strategy');
  log('War strategy service loaded');
} catch (error) {
  // Silently continue if service isn't available
}

// Load role permissions service if available
let rolePermissionsService = null;
try {
  rolePermissionsService = require('./services/role-permissions');
  log('Role permissions service loaded');
} catch (error) {
  // Silently continue if service isn't available
}

// Load giveaway service if available
let giveawayService = null;
try {
  giveawayService = require('./services/giveaway-service');
  log('Giveaway service loaded');
} catch (error) {
  // Silently continue if service isn't available
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
    GatewayIntentBits.GuildMessageReactions, // Needed for reaction-based giveaway entries
    GatewayIntentBits.DirectMessages // For DM notifications to winners
  ]
});

// Store Torn data in the client instance for access across commands
client.tornData = null;

// Initialize commands collection
client.commands = new Collection();

/**
 * Starts the Discord bot and connects all services
 */
function startBot() {
  // Connect to Torn API (REST API with WebSocket fallback)
  startTornWS((data) => {
    client.tornData = data;
    log('Received updated Torn data');
  });

  // Make client globally accessible for services
  global.discordClient = client;

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
    
    // Start attack monitoring service if available
    if (attackMonitor && attackMonitor.startAttackMonitoring) {
      try {
        attackMonitor.startAttackMonitoring(client);
        log('Attack monitoring service started');
      } catch (error) {
        // Silently continue if service fails to start
        // This prevents affecting core bot functionality
      }
    }
    
    // Initialize event service if available
    if (eventService && eventService.initEventService) {
      try {
        eventService.initEventService(client);
        log('Event service initialized');
      } catch (error) {
        logError('Failed to initialize event service:', error);
        // Silently continue if service fails to start
      }
    }
    
    // Initialize chainsheet service if available
    if (chainsheetService && chainsheetService.initChainsheetService) {
      try {
        chainsheetService.initChainsheetService(client);
        log('Chainsheet service initialized');
      } catch (error) {
        logError('Failed to initialize chainsheet service:', error);
        // Silently continue if service fails to start
      }
    }
    
    // Initialize welcome service if available
    if (welcomeService && welcomeService.initWelcomeService) {
      try {
        welcomeService.initWelcomeService(client);
        log('Welcome service initialized');
      } catch (error) {
        logError('Failed to initialize welcome service:', error);
        // Silently continue if service fails to start
        // This ensures that errors in the welcome service don't affect core bot functionality
      }
    }
    
    // Initialize stats tracking service if available
    if (statsTrackingService && statsTrackingService.initStatsTrackingService) {
      try {
        statsTrackingService.initStatsTrackingService(client);
        log('Stats tracking service initialized');
        
        // Process initial stats update if we have faction data
        if (client.tornData && client.tornData.faction) {
          statsTrackingService.processStatsUpdate(client, client.tornData.faction);
          log('Initial faction stats processed');
        }
      } catch (error) {
        logError('Failed to initialize stats tracking service:', error);
        // Silently continue if service fails to start
        // This ensures that errors in the stats tracking service don't affect core bot functionality
      }
    }
    
    // Initialize war countdown service if available
    if (warCountdownService && warCountdownService.initWarCountdownService) {
      try {
        warCountdownService.initWarCountdownService(client);
        log('War countdown service initialized');
      } catch (error) {
        logError('Failed to initialize war countdown service:', error);
        // Silently continue if service fails to start
        // This ensures that errors in the war countdown service don't affect core bot functionality
      }
    }
    
    // Initialize war strategy service if available
    if (warStrategyService && warStrategyService.initWarStrategyService) {
      try {
        warStrategyService.initWarStrategyService(client);
        log('War strategy service initialized');
      } catch (error) {
        logError('Failed to initialize war strategy service:', error);
        // Silently continue if service fails to start
        // This ensures that errors in the war strategy service don't affect core bot functionality
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
        // Check if this is a bank-related button
        if (interaction.customId === 'bank_withdraw') {
          // Try to find bank command
          const bankCommand = client.commands.get('bank');
          if (bankCommand && bankCommand.handleButton) {
            await bankCommand.handleButton(interaction, client);
          }
        }
        // Handle bank fulfillment buttons
        else if (interaction.customId.startsWith('bank_fulfill_')) {
          const requestId = interaction.customId.split('_')[2];
          
          // Execute the bank fulfill command programmatically
          const bankCommand = client.commands.get('bank');
          if (bankCommand) {
            // Create a simulated interaction object for the fulfill command
            const simulatedOptions = {
              getSubcommand: () => 'fulfill',
              getString: (name) => name === 'request_id' ? requestId : null
            };
            
            const simulatedInteraction = {
              ...interaction,
              options: simulatedOptions,
              commandName: 'bank'
            };
            
            await bankCommand.execute(simulatedInteraction, client);
          }
        }
        // Handle bank cancellation buttons
        else if (interaction.customId.startsWith('bank_cancel_')) {
          const requestId = interaction.customId.split('_')[2];
          
          // Execute the bank cancel command programmatically
          const bankCommand = client.commands.get('bank');
          if (bankCommand) {
            // Create a simulated interaction object for the cancel command
            const simulatedOptions = {
              getSubcommand: () => 'cancel',
              getString: (name) => name === 'request_id' ? requestId : null
            };
            
            const simulatedInteraction = {
              ...interaction,
              options: simulatedOptions,
              commandName: 'bank'
            };
            
            await bankCommand.execute(simulatedInteraction, client);
          }
        }
        // Handle event-related buttons
        else if (interaction.customId.startsWith('event_')) {
          // Try to find events command
          const eventsCommand = client.commands.get('events');
          if (eventsCommand && eventsCommand.handleButton) {
            await eventsCommand.handleButton(interaction, client);
          }
        }
        // Handle chainsheet-related buttons
        else if (interaction.customId.startsWith('chainsheet_')) {
          // Try to find chainsheet command
          const chainsheetCommand = client.commands.get('chainsheet');
          if (chainsheetCommand && chainsheetCommand.handleButton) {
            await chainsheetCommand.handleButton(interaction, client);
          }
        }
        // Handle welcome-related buttons
        else if (interaction.customId.startsWith('welcome_')) {
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
        // Handle faction stats buttons
        else if (interaction.customId.startsWith('factionstats_')) {
          // Try to find faction stats command
          const factionstatsCommand = client.commands.get('factionstats');
          if (factionstatsCommand && factionstatsCommand.handleButton) {
            // Use a separate try-catch to ensure faction stats buttons don't affect other functionality
            try {
              const { handleButton } = require('./commands/factionstats');
              await handleButton(interaction, client);
            } catch (statsError) {
              logError('Error in faction stats button handler (isolated):', statsError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this faction stats action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle war countdown buttons
        else if (interaction.customId.startsWith('warcountdown_')) {
          // Try to find war countdown command
          const warcountdownCommand = client.commands.get('warcountdown');
          if (warcountdownCommand && warcountdownCommand.handleButton) {
            // Use a separate try-catch to ensure war countdown buttons don't affect other functionality
            try {
              await warcountdownCommand.handleButton(interaction, client);
            } catch (countdownError) {
              logError('Error in war countdown button handler (isolated):', countdownError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this war countdown action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle war strategy buttons
        else if (interaction.customId.startsWith('warstrategy_')) {
          // Try to find war strategy command
          const warstrategyCommand = client.commands.get('warstrategy');
          if (warstrategyCommand && warstrategyCommand.handleButton) {
            // Use a separate try-catch to ensure war strategy buttons don't affect other functionality
            try {
              await warstrategyCommand.handleButton(interaction, client);
            } catch (strategyError) {
              logError('Error in war strategy button handler (isolated):', strategyError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this war strategy action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle permissions buttons
        else if (interaction.customId.startsWith('permissions_')) {
          // Try to find bot permissions command
          const botpermissionsCommand = client.commands.get('botpermissions');
          if (botpermissionsCommand && botpermissionsCommand.handleButton) {
            // Use a separate try-catch to ensure permissions buttons don't affect other functionality
            try {
              await botpermissionsCommand.handleButton(interaction, client);
            } catch (permissionsError) {
              logError('Error in bot permissions button handler (isolated):', permissionsError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this permissions action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle API key buttons
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
        // Handle target finder buttons
        else if (interaction.customId.startsWith('targetfinder_')) {
          // Try to find targetfinder command
          const targetfinderCommand = client.commands.get('targetfinder');
          if (targetfinderCommand && targetfinderCommand.handleButton) {
            // Use a separate try-catch to ensure target finder buttons don't affect other functionality
            try {
              await targetfinderCommand.handleButton(interaction, client);
            } catch (targetfinderError) {
              logError('Error in target finder button handler (isolated):', targetfinderError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this target finder action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle giveaway buttons
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
        // Handle activity heat map buttons
        else if (interaction.customId.startsWith('heatmap_')) {
          // Try to find activitymap command
          const activitymapCommand = client.commands.get('activitymap');
          if (activitymapCommand && activitymapCommand.handleButton) {
            // Use a separate try-catch to ensure activity heat map buttons don't affect other functionality
            try {
              await activitymapCommand.handleButton(interaction, client);
            } catch (heatmapError) {
              logError('Error in activity heat map button handler (isolated):', heatmapError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this activity heat map action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle war pay buttons
        else if (interaction.customId.startsWith('warpay_')) {
          // Try to find warpay command
          const warpayCommand = client.commands.get('warpay');
          if (warpayCommand && warpayCommand.handleButton) {
            // Use a separate try-catch to ensure war pay buttons don't affect other functionality
            try {
              await warpayCommand.handleButton(interaction, client);
            } catch (warpayError) {
              logError('Error in war pay button handler (isolated):', warpayError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this war pay action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle battle stats buttons
        else if (interaction.customId.startsWith('battlestats_')) {
          // Try to find battlestats command
          const battlestatsCommand = client.commands.get('battlestats');
          if (battlestatsCommand && battlestatsCommand.handleButton) {
            // Use a separate try-catch to ensure battle stats buttons don't affect other functionality
            try {
              await battlestatsCommand.handleButton(interaction, client);
            } catch (statsError) {
              logError('Error in battle stats button handler (isolated):', statsError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing this battle stats action. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
      } catch (error) {
        logError('Error handling button interaction:', error);
        
        // Try to respond with an error
        try {
          if (!interaction.replied) {
            await interaction.reply({
              content: '❌ There was an error handling this button.',
              ephemeral: true
            });
          }
        } catch (replyError) {
          logError('Error sending button error reply:', replyError);
        }
      }
      return;
    }
    
    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      try {
        // Check if this is a bank-related modal
        if (interaction.customId.startsWith('bank_withdraw_modal_')) {
          // Try to find bank command
          const bankCommand = client.commands.get('bank');
          if (bankCommand && bankCommand.handleModal) {
            await bankCommand.handleModal(interaction, client);
          }
        }
        // Handle event-related modals
        else if (interaction.customId.startsWith('event_')) {
          // Try to find events command
          const eventsCommand = client.commands.get('events');
          if (eventsCommand && eventsCommand.handleModal) {
            await eventsCommand.handleModal(interaction, client);
          }
        }
        // Handle chainsheet-related modals
        else if (interaction.customId.startsWith('chainsheet_')) {
          // Try to find chainsheet command
          const chainsheetCommand = client.commands.get('chainsheet');
          if (chainsheetCommand && chainsheetCommand.handleModal) {
            await chainsheetCommand.handleModal(interaction, client);
          }
        }
        // Handle war strategy modals
        else if (interaction.customId.startsWith('warstrategy_')) {
          // Try to find war strategy command
          const warstrategyCommand = client.commands.get('warstrategy');
          if (warstrategyCommand && warstrategyCommand.handleModal) {
            // Use a separate try-catch to ensure war strategy modals don't affect other functionality
            try {
              await warstrategyCommand.handleModal(interaction, client);
            } catch (strategyError) {
              logError('Error in war strategy modal handler (isolated):', strategyError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your war strategy submission. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle API key modals
        else if (interaction.customId.startsWith('apikey_')) {
          // Try to find apikey command
          const apikeyCommand = client.commands.get('apikey');
          if (apikeyCommand && apikeyCommand.handleModal) {
            // Use a separate try-catch to ensure API key modals don't affect other functionality
            try {
              await apikeyCommand.handleModal(interaction, client);
            } catch (apikeyError) {
              logError('Error in API key modal handler (isolated):', apikeyError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your API key submission. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle target finder modals
        else if (interaction.customId.startsWith('targetfinder_')) {
          // Try to find targetfinder command
          const targetfinderCommand = client.commands.get('targetfinder');
          if (targetfinderCommand && targetfinderCommand.handleModal) {
            // Use a separate try-catch to ensure target finder modals don't affect other functionality
            try {
              await targetfinderCommand.handleModal(interaction, client);
            } catch (targetfinderError) {
              logError('Error in target finder modal handler (isolated):', targetfinderError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your stats submission. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle giveaway modals
        else if (interaction.customId.startsWith('giveaway_')) {
          // Try to find giveaway command
          const giveawayCommand = client.commands.get('giveaway');
          if (giveawayCommand && giveawayCommand.handleModal) {
            // Use a separate try-catch to ensure giveaway modals don't affect other functionality
            try {
              await giveawayCommand.handleModal(interaction, client);
            } catch (giveawayError) {
              logError('Error in giveaway modal handler (isolated):', giveawayError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your giveaway submission. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
      } catch (error) {
        logError('Error handling modal submission:', error);
        
        // Try to respond with an error
        try {
          if (!interaction.replied) {
            await interaction.reply({
              content: '❌ There was an error processing your submission.',
              ephemeral: true
            });
          }
        } catch (replyError) {
          logError('Error sending modal error reply:', replyError);
        }
      }
    }
    
    // Handle select menu interactions
    if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) {
      try {
        // Handle permissions select menus
        if (interaction.customId.startsWith('permissions_')) {
          // Try to find bot permissions command
          const botpermissionsCommand = client.commands.get('botpermissions');
          if (botpermissionsCommand && botpermissionsCommand.handleSelectMenu) {
            // Use a separate try-catch to ensure permissions select menus don't affect other functionality
            try {
              await botpermissionsCommand.handleSelectMenu(interaction, client);
            } catch (permissionsError) {
              logError('Error in bot permissions select menu handler (isolated):', permissionsError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your selection. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle war strategy select menus
        else if (interaction.customId.startsWith('warstrategy_')) {
          // Try to find war strategy command
          const warstrategyCommand = client.commands.get('warstrategy');
          if (warstrategyCommand && warstrategyCommand.handleSelectMenu) {
            // Use a separate try-catch to ensure war strategy select menus don't affect other functionality
            try {
              await warstrategyCommand.handleSelectMenu(interaction, client);
            } catch (strategyError) {
              logError('Error in war strategy select menu handler (isolated):', strategyError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your selection. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
        // Handle activity heat map select menus
        else if (interaction.customId.startsWith('heatmap_')) {
          // Try to find activitymap command
          const activitymapCommand = client.commands.get('activitymap');
          if (activitymapCommand && activitymapCommand.handleSelectMenu) {
            // Use a separate try-catch to ensure activity heat map select menus don't affect other functionality
            try {
              await activitymapCommand.handleSelectMenu(interaction, client);
            } catch (heatmapError) {
              logError('Error in activity heat map select menu handler (isolated):', heatmapError);
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ There was an error processing your selection. This error has been logged and will not affect other bot functionality.',
                  ephemeral: true
                }).catch(() => {});
              }
            }
          }
        }
      } catch (error) {
        logError('Error handling select menu interaction:', error);
        
        // Try to respond with an error
        try {
          if (!interaction.replied) {
            await interaction.reply({
              content: '❌ There was an error handling your selection.',
              ephemeral: true
            });
          }
        } catch (replyError) {
          logError('Error sending select menu error reply:', replyError);
        }
      }
    }
    
    // Handle autocomplete interactions
    if (interaction.isAutocomplete()) {
      try {
        const command = client.commands.get(interaction.commandName);
        if (command && command.handleAutocomplete) {
          await command.handleAutocomplete(interaction, client);
        }
      } catch (error) {
        logError(`Error handling autocomplete for ${interaction.commandName}:`, error);
        // For autocomplete, we should just return empty results on error
        await interaction.respond([]).catch(() => {});
      }
    }
  });

  // Ping/pong monitoring
  client.ws.on('ping', () => {
    log(`WebSocket ping: ${client.ws.ping}ms`);
  });
  
  // Handle message reaction add events (for giveaways)
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      // When a reaction is received, check if the message is partially cached
      if (reaction.partial) {
        // If the message this reaction belongs to was removed, the fetching might result in an error
        try {
          await reaction.fetch();
        } catch (error) {
          logError('Error fetching reaction:', error);
          return;
        }
      }
      
      // Handle giveaway reactions if the service is available
      if (giveawayService && giveawayService.handleReactionAdd) {
        try {
          await giveawayService.handleReactionAdd(reaction, user);
        } catch (error) {
          logError('Error handling giveaway reaction add (isolated):', error);
          // Silently continue to prevent affecting core functionality
        }
      }
    } catch (error) {
      // Safely catch any errors to prevent disruption to the bot
      logError('Error in reaction add handler:', error);
    }
  });
  
  // Handle message reaction remove events (for giveaways)
  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    try {
      // When a reaction is removed, check if the message is partially cached
      if (reaction.partial) {
        // If the message this reaction belongs to was removed, the fetching might result in an error
        try {
          await reaction.fetch();
        } catch (error) {
          logError('Error fetching reaction:', error);
          return;
        }
      }
      
      // Handle giveaway reactions if the service is available
      if (giveawayService && giveawayService.handleReactionRemove) {
        try {
          await giveawayService.handleReactionRemove(reaction, user);
        } catch (error) {
          logError('Error handling giveaway reaction remove (isolated):', error);
          // Silently continue to prevent affecting core functionality
        }
      }
    } catch (error) {
      // Safely catch any errors to prevent disruption to the bot
      logError('Error in reaction remove handler:', error);
    }
  });

  // Login to Discord
  client.login(process.env.DISCORD_TOKEN)
    .then(() => log('Successfully connected to Discord'))
    .catch(error => {
      logError('Failed to connect to Discord:', error);
      process.exit(1);
    });

  return client;
}

module.exports = { startBot };

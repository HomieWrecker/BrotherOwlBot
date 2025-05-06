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

// Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // Additional intents for welcome system
    GatewayIntentBits.GuildMembers // Needed to detect member join/leave events
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

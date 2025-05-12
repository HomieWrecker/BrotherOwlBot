const { Client, GatewayIntentBits, ActivityType, Events, Collection } = require('discord.js');
const { registerCommands } = require('./commands/index');
const { log, logError } = require('./utils/logger');
const { BOT_CONFIG } = require('./config');
const path = require('path');
const fs = require('fs');

// Load welcome service
let welcomeService = null;
try {
  welcomeService = require('./services/welcome-service');
  log('Welcome service loaded');
} catch (error) {
  logError('Error loading welcome service:', error);
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
      } catch (error) {
        logError('Error handling button interaction:', error);
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

  // Log in to Discord
  client.login(process.env.DISCORD_TOKEN)
    .catch(error => {
      logError('Failed to log in to Discord:', error);
      throw error; // Re-throw to trigger process restart in index.js
    });
}

module.exports = { startBot };
const { Client, GatewayIntentBits, ActivityType, Events, Collection } = require('discord.js');
const { startTornWS } = require('./torn-ws');
const { registerCommands } = require('./commands/index');
const { log, logError } = require('./utils/logger');
const { BOT_CONFIG } = require('./config');
const path = require('path');
const fs = require('fs');

// Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
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
  });

  // Handle slash command interactions
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

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

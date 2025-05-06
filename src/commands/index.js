const { REST, Routes } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { statusCommand } = require('./status');
const { helpCommand } = require('./help');
const { apikeyCommand } = require('./apikey');
const { playerStatsCommand } = require('./playerstats');

// Collection of commands to register
const commands = [
  statusCommand,
  apikeyCommand,
  playerStatsCommand,
  helpCommand
];

/**
 * Registers all slash commands with Discord API
 * @param {Client} client - Discord client instance
 */
async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  
  // Add commands to client collection
  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }
  
  // Format commands for REST API
  const commandsData = commands.map(command => command.data.toJSON());

  try {
    log(`Registering ${commands.length} application (/) commands globally`);
    
    // Global command registration
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commandsData }
    );
    
    log('Successfully registered application commands');
  } catch (error) {
    logError('Error registering commands:', error);
    throw error;
  }
}

module.exports = { registerCommands };

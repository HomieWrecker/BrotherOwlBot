const { REST, Routes } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { statusCommand } = require('./status');
const { helpCommand } = require('./help');
const { apikeyCommand } = require('./apikey');
const { playerStatsCommand } = require('./playerstats');

// Try to load new commands without affecting existing functionality
// Spy and targetfinder commands have been removed from this list
let factionCommand, attacksCommand, bankCommand, eventsCommand, chainsheetCommand, welcomeCommand, factionstatsCommand, warcountdownCommand, warstrategyCommand, botpermissionsCommand, giveawayCommand, activitymapCommand, warpayCommand, battlestatsCommand, apiconnectionCommand;
try {
  factionCommand = require('./faction').factionCommand;
  log('Loaded faction command');
} catch (error) {
  // Silently continue if module doesn't exist
}

try {
  attacksCommand = require('./attacks').attacksCommand;
  log('Loaded attacks command');
} catch (error) {
  // Silently continue if module doesn't exist
}

try {
  bankCommand = require('./bank').bankCommand;
  log('Loaded bank command');
} catch (error) {
  // Silently continue if module doesn't exist
}

try {
  eventsCommand = require('./events').eventsCommand;
  log('Loaded events command');
} catch (error) {
  // Silently continue if module doesn't exist
}

try {
  chainsheetCommand = require('./chainsheet').chainsheetCommand;
  log('Loaded chainsheet command');
} catch (error) {
  // Silently continue if module doesn't exist
}

try {
  welcomeCommand = require('./welcome').welcomeCommand;
  log('Loaded welcome command');
} catch (error) {
  // Silently continue if module doesn't exist
  // This ensures that if the welcome command has errors, it won't break the entire bot
}

try {
  factionstatsCommand = require('./factionstats').factionstatsCommand;
  log('Loaded faction stats command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading faction stats command:', error);
}

try {
  warcountdownCommand = require('./warcountdown').warcountdownCommand;
  log('Loaded war countdown command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading war countdown command:', error);
}

try {
  warstrategyCommand = require('./warstrategy').warstrategyCommand;
  log('Loaded war strategy command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading war strategy command:', error);
}

try {
  botpermissionsCommand = require('./botpermissions').botpermissionsCommand;
  log('Loaded bot permissions command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading bot permissions command:', error);
}

// Spy and targetfinder commands have been removed
// They were causing stability issues

try {
  giveawayCommand = require('./giveaway').giveawayCommand;
  log('Loaded giveaway command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading giveaway command:', error);
}

try {
  activitymapCommand = require('./activitymap').activitymapCommand;
  log('Loaded activity heat map command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading activity heat map command:', error);
}

try {
  warpayCommand = require('./warpay');
  log('Loaded war pay command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading war pay command:', error);
}

try {
  battlestatsCommand = require('./battlestats');
  log('Loaded battle stats command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading battle stats command:', error);
}

try {
  apiconnectionCommand = require('./apiconnection');
  log('Loaded API connection command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading API connection command:', error);
}

// Collection of commands to register
const commands = [
  statusCommand,
  apikeyCommand,
  playerStatsCommand,
  helpCommand
];

// Add new commands if available
if (factionCommand) commands.push(factionCommand);
if (attacksCommand) commands.push(attacksCommand);
if (bankCommand) commands.push(bankCommand);
if (eventsCommand) commands.push(eventsCommand);
if (chainsheetCommand) commands.push(chainsheetCommand);
if (welcomeCommand) commands.push(welcomeCommand);
if (factionstatsCommand) commands.push(factionstatsCommand);
if (warcountdownCommand) commands.push(warcountdownCommand);
if (warstrategyCommand) commands.push(warstrategyCommand);
if (botpermissionsCommand) commands.push(botpermissionsCommand);
// Spy and targetfinder commands have been removed
if (giveawayCommand) commands.push(giveawayCommand);
if (activitymapCommand) commands.push(activitymapCommand);
if (warpayCommand) commands.push(warpayCommand);
if (battlestatsCommand) commands.push(battlestatsCommand);
if (apiconnectionCommand) commands.push(apiconnectionCommand);

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

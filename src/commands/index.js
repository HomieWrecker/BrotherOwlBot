const { REST, Routes } = require('discord.js');
const { log, logError } = require('../utils/logger');

// Try to load welcome command without affecting existing functionality
let welcomeCommand;
try {
  welcomeCommand = require('./welcome');
  log('Loaded welcome command');
} catch (error) {
  // Silently continue if module doesn't exist
  // This ensures that if the welcome command has errors, it won't break the entire bot
  logError('Error loading welcome command:', error);
}

// Try to load apikey command without affecting existing functionality
let apikeyCommand;
try {
  apikeyCommand = require('./apikey');
  log('Loaded apikey command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading apikey command:', error);
}

// Try to load stats command without affecting existing functionality
let statsCommand;
try {
  statsCommand = require('./stats');
  log('Loaded stats command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading stats command:', error);
}

// Try to load factioninfo command without affecting existing functionality
let factionInfoCommand;
try {
  factionInfoCommand = require('./factioninfo');
  log('Loaded factioninfo command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading factioninfo command:', error);
}

// Try to load botpermissions command without affecting existing functionality
let botPermissionsCommand;
try {
  botPermissionsCommand = require('./botpermissions');
  log('Loaded botpermissions command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading botpermissions command:', error);
}

// Try to load ping command without affecting existing functionality
let pingCommand;
try {
  pingCommand = require('./ping');
  log('Loaded ping command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading ping command:', error);
}

// Try to load bank command without affecting existing functionality
let bankCommand;
try {
  bankCommand = require('./bank');
  log('Loaded bank command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading bank command:', error);
}

// Try to load giveaway command without affecting existing functionality
let giveawayCommand;
try {
  giveawayCommand = require('./giveaway');
  log('Loaded giveaway command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading giveaway command:', error);
}

// Try to load events command without affecting existing functionality
let eventsCommand;
try {
  eventsCommand = require('./events');
  log('Loaded events command');
} catch (error) {
  // Silently continue if module doesn't exist
  logError('Error loading events command:', error);
}

// Collection of commands to register
const commands = [];

// Add welcome command if available
if (welcomeCommand && welcomeCommand.data) commands.push(welcomeCommand);

// Add apikey command if available
if (apikeyCommand && apikeyCommand.data) commands.push(apikeyCommand);

// Add stats command if available
if (statsCommand && statsCommand.data) commands.push(statsCommand);

// Add factioninfo command if available
if (factionInfoCommand && factionInfoCommand.data) commands.push(factionInfoCommand);

// Add botpermissions command if available
if (botPermissionsCommand && botPermissionsCommand.data) commands.push(botPermissionsCommand);

// Add ping command if available
if (pingCommand && pingCommand.data) commands.push(pingCommand);

// Add bank command if available
if (bankCommand && bankCommand.data) commands.push(bankCommand);

// Add giveaway command if available
if (giveawayCommand && giveawayCommand.data) commands.push(giveawayCommand);

// Add events command if available
if (eventsCommand && eventsCommand.data) commands.push(eventsCommand);

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

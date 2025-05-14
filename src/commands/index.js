// src/commands/index.js

import { REST, Routes, Collection } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';
import { BOT_CONFIG } from '../config.js';
import { log, logError } from '../utils/logger.js';

// Initialize command collection for the client
const commandsMap = new Collection();

/**
 * Dynamically load commands from a folder
 */
function loadCommandsFromFolder(folderPath, commandsArray = []) {
  const files = readdirSync(folderPath).filter(file => file.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const command = require(filePath);

    if (command.data && command.execute) {
      commandsArray.push(command.data.toJSON());
      commandsMap.set(command.data.name, command);
      log(`Loaded ${command.data.name} command`);
    } else {
      logError(`Invalid command format in ${file}`);
    }
  }

  return commandsArray;
}

/**
 * Register all commands with Discord
 * @param {Client} client - The Discord client
 */
export async function registerCommands(client) {
  const allCommands = [];

  const commandsPath = path.resolve('./src/commands');
  const peacePath = path.resolve('./src/commands/peace');

  loadCommandsFromFolder(commandsPath, allCommands);
  loadCommandsFromFolder(peacePath, allCommands);

  // Attach command collection to client
  client.commands = commandsMap;

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    log('Registering slash commands with Discord...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: allCommands }
    );

    log(`Successfully registered ${allCommands.length} commands.`);
  } catch (error) {
    logError('Error registering slash commands:', error);
  }
}

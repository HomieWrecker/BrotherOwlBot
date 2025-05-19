import { REST, Routes, Collection } from 'discord.js';
import { BOT_CONFIG } from '../config/config.js';

export async function registerCommands(client) {
  client.commands = new Collection();

  // Register example command
  client.commands.set('ping', {
    name: 'ping',
    description: 'Replies with Pong!',
    execute: async (interaction) => {
      await interaction.reply('Pong!');
    },
  });

  const rest = new REST({ version: '10' }).setToken(BOT_CONFIG.token);
  try {
    await rest.put(
      Routes.applicationCommands('1116766123501821992'),
      { body: Array.from(client.commands.values()).map(cmd => ({
        name: cmd.name,
        description: cmd.description,
      })) }
    );
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

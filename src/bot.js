import { Client, GatewayIntentBits } from 'discord.js';
import { registerCommands } from './commands/index.js';
import { log, logError } from './utils/logger.js';
import { BOT_CONFIG } from './config/config.js';

export async function startBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.commands = new Map();
  await registerCommands(client);

  client.once('ready', () => {
    log(`Bot logged in as ${client.user.tag}`);
  });

  client.on('error', error => {
    logError('Client error:', error);
  });

  client.login(BOT_CONFIG.token);
}

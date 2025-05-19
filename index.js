import 'dotenv/config';
import { startBot } from './src/bot.js';
import { log, logError } from './src/utils/logger.js';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve('./data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  log('Created data directory');
}

try {
  startBot();
} catch (error) {
  logError('Error starting bot:', error);
}

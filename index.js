// Entry point for the BrotherOwl Discord bot
const { startBot } = require('./src/bot');
const { startTornWS } = require('./src/torn-ws');
const { log, logError } = require('./src/utils/logger');
const { startKeepAliveServer } = require('./keepalive');
const fs = require('fs');
const path = require('path');

// Detect environment
const IS_REPLIT = process.env.REPL_ID && process.env.REPL_OWNER;
const IS_DEV = process.env.NODE_ENV === 'development';

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  log('Created data directory');
}

// Automatic restart logic for resilience
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 10; // Increased from 5
const RESTART_DELAY = 30000; // 30 seconds (reduced from 60 seconds)
const RESTART_RESET_TIMEOUT = 3600000; // 1 hour

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logError('Uncaught Exception:', error);
  attemptRestart('uncaught exception');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection at:', promise, 'reason:', reason);
  // Not restarting for unhandled rejections as they may not be fatal
});

// Main startup function with error recovery
function startup() {
  try {
    // Start the bot and connect to Torn API via WebSocket
    log('Starting BrotherOwl Discord bot...');
    const client = startBot();
    
    // Set up recovery monitoring
    if (client) {
      client.on('error', (error) => {
        logError('Discord client error:', error);
        attemptRestart('Discord client error');
      });
      
      client.on('disconnect', (event) => {
        logError('Discord client disconnected:', event);
        // Let the built-in reconnection handle this first
      });
      
      // Reset restart counter after successful connection
      client.once('ready', () => {
        restartAttempts = 0;
      });
    }
    
    // Start keep-alive server if on Replit
    if (IS_REPLIT) {
      startKeepAliveServer(3000);
      log('Started keep-alive server for Replit (not needed for Synology NAS)');
    }
    
    // Print deployment guidance
    log('-----------------------------------');
    log('DEPLOYMENT INFORMATION:');
    if (IS_REPLIT) {
      log('Running on Replit - keep-alive server enabled');
      log('For 24/7 uptime, you need a Replit Core subscription');
    } else {
      log('Running on a custom server (suitable for Synology NAS)');
    }
    log('Required environment variables:');
    log('- DISCORD_TOKEN: Your Discord bot token');
    log('- TORN_API_KEY: Your Torn API key');
    log('-----------------------------------');
    
  } catch (error) {
    logError('Critical startup error:', error);
    attemptRestart('critical startup error');
  }
}

// Attempt to restart the bot with exponential backoff
function attemptRestart(reason) {
  if (restartAttempts < MAX_RESTART_ATTEMPTS) {
    restartAttempts++;
    const delay = RESTART_DELAY * Math.pow(2, restartAttempts - 1);
    log(`Attempting restart ${restartAttempts}/${MAX_RESTART_ATTEMPTS} in ${delay/1000} seconds due to ${reason}`);
    
    setTimeout(() => {
      log('Executing scheduled restart...');
      startup();
    }, delay);
  } else {
    logError(`Maximum restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Please check the logs and restart manually.`);
  }
}

// Process termination handling
process.on('SIGINT', () => {
  log('Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Start the application
startup();

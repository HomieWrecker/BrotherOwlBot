// Entry point for the BrotherOwl Discord bot
const { startBot } = require('./src/bot');
const { startTornWS } = require('./src/torn-ws');
const { log, logError } = require('./src/utils/logger');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logError('Uncaught Exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the bot and connect to Torn API via WebSocket
log('Starting BrotherOwl Discord bot...');
startBot();

// Process termination handling
process.on('SIGINT', () => {
  log('Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

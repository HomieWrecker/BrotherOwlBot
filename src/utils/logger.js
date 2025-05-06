/**
 * Logging utility for consistent log formatting
 */

// Standard info logging
function log(...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [INFO]`, ...args);
}

// Error logging
function logError(...args) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR]`, ...args);
}

// Warning logging
function logWarning(...args) {
  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] [WARNING]`, ...args);
}

// Debug logging - only shown when debug mode is enabled
function logDebug(...args) {
  if (process.env.DEBUG === 'true') {
    const timestamp = new Date().toISOString();
    console.debug(`[${timestamp}] [DEBUG]`, ...args);
  }
}

// WebSocket specific logging
function logWS(...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [WEBSOCKET]`, ...args);
}

module.exports = {
  log,
  logError,
  logWarning,
  logDebug,
  logWS
};

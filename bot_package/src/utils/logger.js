/**
 * Logging utility for consistent log formatting
 */

// Standard info logging
function log(message, silent = false, ...args) {
  if (!silent) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO]`, message, ...args);
  }
}

// Error logging
function logError(message, ...args) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR]`, message, ...args);
}

// Warning logging
function logWarning(message, ...args) {
  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] [WARNING]`, message, ...args);
}

// Debug logging - only shown when debug mode is enabled
function logDebug(message, ...args) {
  if (process.env.DEBUG === 'true') {
    const timestamp = new Date().toISOString();
    console.debug(`[${timestamp}] [DEBUG]`, message, ...args);
  }
}

// WebSocket specific logging
function logWS(message, silent = false, ...args) {
  if (!silent) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [WEBSOCKET]`, message, ...args);
  }
}

module.exports = {
  log,
  logError,
  logWarning,
  logDebug,
  logWS
};

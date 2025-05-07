/**
 * Enhanced Torn API connectivity module
 * Uses a hybrid WebSocket/HTTP approach with automatic failover
 * and intelligent prioritization of data types.
 */
const { log, logError, logWarning } = require('./utils/logger');

// Import the new TornAPI service
const TornAPIService = require('./services/torn-api-service');

// Import chain monitor but without modifying existing imports
let chainMonitor = null;
try {
  chainMonitor = require('./services/chain-monitor');
  log('Chain monitoring service loaded');
} catch (error) {
  // Silently continue if the module doesn't exist
}

// State tracking
let apiService = null;
let fallbackMode = true; // Start with HTTP for reliability
let fallbackTimer = null;
const FALLBACK_INTERVAL = 30000; // 30 seconds
let healthCheckTimer = null;
let globalCallback = null;

/**
 * Starts data connection to the Torn API using the hybrid service
 * @param {Function} callback - Function to call when data is received
 */
function startTornWS(callback) {
  globalCallback = callback;
  
  // Initialize API service if not already done
  if (!apiService) {
    apiService = TornAPIService.initialize(process.env.TORN_API_KEY);
    log('Initialized Torn API hybrid service');
  }
  
  // Subscribe to chain events (highest priority)
  apiService.subscribeToEvent('chain', (data) => {
    processChainData(data, callback);
  }, process.env.TORN_API_KEY);
  
  // Start with immediate HTTP request for chain data to get initial data quickly
  fetchChainDataFallback(callback);
  
  // Start health check
  startHealthCheck(callback);
  
  return apiService;
}

/**
 * Process chain data received from any source
 * @param {Object} data - Chain data
 * @param {Function} callback - Function to call with processed data
 */
function processChainData(data, callback) {
  try {
    // Ensure data has lastUpdate timestamp
    if (!data.lastUpdate) {
      data.lastUpdate = Date.now();
    }
    
    // Process with callback (for main bot functionality)
    callback(data);
    
    // Also process chain data with the chain monitor if available
    if (chainMonitor && chainMonitor.processChainData) {
      try {
        // Pass through the client for Discord access
        const client = global.discordClient;
        if (client) {
          chainMonitor.processChainData(client, data);
        }
      } catch (error) {
        // Silently continue if chain monitoring fails
        // This ensures the main bot functionality isn't affected
      }
    }
  } catch (error) {
    logError('Error processing chain data:', error);
  }
}

/**
 * Fetch chain data via HTTP API (used for initialization and fallback)
 * @param {Function} callback - Function to call when data is received
 */
function fetchChainDataFallback(callback) {
  // Clear any existing timers
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  
  const mode = fallbackMode ? '(fallback mode)' : '(periodic update)';
  log(`Fetching chain data via REST API ${mode}`);
  
  // Use the service to fetch data
  apiService.fetchData('faction', 'chain', process.env.TORN_API_KEY)
    .then(parsedData => {
      // Format data to match WebSocket format
      const formattedData = { 
        chain: parsedData.chain || {},
        faction: parsedData.faction || { ID: parsedData.ID },
        lastUpdate: Date.now(),
        source: 'http'
      };
      
      // Process the data
      processChainData(formattedData, callback);
      
      // Schedule next fallback update
      fallbackTimer = setTimeout(() => fetchChainDataFallback(callback), FALLBACK_INTERVAL);
    })
    .catch(error => {
      logError('Error fetching chain data via HTTP:', error);
      // Schedule retry
      fallbackTimer = setTimeout(() => fetchChainDataFallback(callback), FALLBACK_INTERVAL);
    });
}

/**
 * Start health check to periodically try reconnecting services
 * @param {Function} callback - Function to call when data is received
 */
function startHealthCheck(callback) {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }
  
  log('Starting Torn API connection health check service');
  
  healthCheckTimer = setInterval(() => {
    // Get connection status from service
    const status = apiService.getConnectionStatus();
    
    // If WebSocket is not connected, the service will automatically try to reconnect
    // But we can also manually trigger HTTP fallback if needed
    if (!status.websocket.connected && fallbackMode) {
      fetchChainDataFallback(callback);
    }
  }, 60000); // Check every minute
}

/**
 * Manually reconnect the API services
 * @param {Function} callback - Function to call when data is received
 */
function reconnectTornWS(callback) {
  log('Manually reconnecting to Torn API services...');
  
  // Clean up existing resources
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  
  // Use the service's reset function
  apiService.resetConnection();
  
  // Resubscribe to chain events
  apiService.subscribeToEvent('chain', (data) => {
    processChainData(data, callback || globalCallback);
  }, process.env.TORN_API_KEY);
  
  // Start with HTTP for immediate data
  fetchChainDataFallback(callback || globalCallback);
  
  // Restart health check
  startHealthCheck(callback || globalCallback);
}

/**
 * Reset all connections and start fresh
 * @param {Function} callback - Function to call when data is received 
 */
function resetAllConnections(callback) {
  log('Performing full reset of all Torn API connections...');
  
  // Clean up existing resources
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  
  // Reset service if it exists
  if (apiService) {
    apiService.resetConnection();
  } else {
    // Initialize if not exists
    apiService = TornAPIService.initialize(process.env.TORN_API_KEY);
  }
  
  // Start fresh with HTTP first for immediate data
  fetchChainDataFallback(callback || globalCallback);
  
  // Restart health check
  startHealthCheck(callback || globalCallback);
  
  // Subscribe to chain events
  apiService.subscribeToEvent('chain', (data) => {
    processChainData(data, callback || globalCallback);
  }, process.env.TORN_API_KEY);
}

module.exports = {
  startTornWS,
  reconnectTornWS,
  resetAllConnections
};

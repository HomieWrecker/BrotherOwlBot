const WebSocket = require('ws');
const { log, logError, logWarning } = require('./utils/logger');
const https = require('https');

// Import chain monitor but without modifying existing imports
let chainMonitor = null;
try {
  chainMonitor = require('./services/chain-monitor');
  log('Chain monitoring service loaded');
} catch (error) {
  // Silently continue if the module doesn't exist
}

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3; // Reduced WebSocket attempts
const RECONNECT_DELAY_BASE = 5000; // 5 seconds

// REST API is now the primary method since WebSocket has been unreliable
let fallbackMode = true; // Start with REST API by default
let lastFallbackFetch = 0;
const FALLBACK_INTERVAL = 30000; // 30 seconds between API calls for more frequent updates
let fallbackTimer = null;
let healthCheckTimer = null;
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute

/**
 * Starts data connection to the Torn API
 * @param {Function} callback - Function to call when data is received
 */
function startTornWS(callback) {
  // Close existing connection if any
  if (ws) {
    try {
      ws.terminate();
    } catch (error) {
      logError('Error terminating existing WebSocket:', error);
    }
  }

  // If we've reached max reconnect attempts or we're in fallback mode, use REST API
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS || fallbackMode) {
    if (!fallbackMode) {
      logWarning('Using REST API mode for chain data');
      fallbackMode = true;
    }
    fetchChainDataFallback(callback);
    return null;
  }

  log('Attempting to connect to Torn API WebSocket...');
  
  try {
    // Try to establish a new WebSocket connection
    ws = new WebSocket('wss://api.torn.com/wss/');

    // Connection opened
    ws.on('open', () => {
      reconnectAttempts = 0;
      fallbackMode = false;
      log('Connected to Torn WebSocket API');
      
      // Subscribe to chain events
      const subscriptionMessage = {
        action: 'subscribe',
        key: process.env.TORN_API_KEY,
        events: ['chain']
      };
      
      ws.send(JSON.stringify(subscriptionMessage));
      log('Subscribed to chain events');
    });

    // Message received
    ws.on('message', (data) => {
      try {
        const parsedData = JSON.parse(data);
        
        if (parsedData.error) {
          logError('Torn API WebSocket error:', parsedData.error);
          return;
        }
        
        // Add timestamp for when data was last received
        parsedData.lastUpdate = Date.now();
        
        // Process with callback (for main bot functionality)
        callback(parsedData);
        
        // Also process chain data with the chain monitor if available
        if (chainMonitor && chainMonitor.processChainData) {
          try {
            // Pass through the client for Discord access
            const client = global.discordClient;
            if (client) {
              chainMonitor.processChainData(client, parsedData);
            }
          } catch (error) {
            // Silently continue if chain monitoring fails
            // This ensures the main bot functionality isn't affected
          }
        }
      } catch (error) {
        logError('Error parsing WebSocket message:', error);
      }
    });

    // Connection error handling
    ws.on('error', (error) => {
      logError('Torn WebSocket error:', error);
    });

    // Connection closed, attempt to reconnect
    ws.on('close', (code, reason) => {
      log(`Torn WebSocket connection closed. Code: ${code}, Reason: ${reason || 'No reason provided'}`);
      
      // Implement exponential backoff for reconnection
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts);
        reconnectAttempts++;
        
        log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay / 1000} seconds...`);
        
        setTimeout(() => {
          // Try to reconnect
          startTornWS(callback);
        }, delay);
      } else {
        // Switch to fallback mode after max reconnect attempts
        logWarning(`Maximum reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Falling back to REST API.`);
        fallbackMode = true;
        fetchChainDataFallback(callback);
        
        // Set up a health check to occasionally try WebSocket again
        if (!healthCheckTimer) {
          healthCheckTimer = setInterval(() => {
            if (fallbackMode) {
              log('Health check: attempting to reconnect WebSocket...');
              reconnectAttempts = 0;
              fallbackMode = false;
              startTornWS(callback);
            }
          }, HEALTH_CHECK_INTERVAL);
        }
      }
    });
  } catch (error) {
    logError('Error setting up WebSocket:', error);
    
    // If WebSocket setup fails, use fallback mode
    fallbackMode = true;
    fetchChainDataFallback(callback);
  }
  
  return ws;
}

/**
 * Fetch chain data via HTTP API (fallback method)
 * @param {Function} callback - Function to call when data is received
 */
function fetchChainDataFallback(callback) {
  // Prevent too frequent API calls
  const now = Date.now();
  if (now - lastFallbackFetch < FALLBACK_INTERVAL) {
    // Schedule next fetch
    if (!fallbackTimer) {
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        fetchChainDataFallback(callback);
      }, FALLBACK_INTERVAL - (now - lastFallbackFetch));
    }
    return;
  }
  
  lastFallbackFetch = now;
  log('Fetching chain data via REST API (fallback mode)');
  
  const options = {
    hostname: 'api.torn.com',
    path: `/faction/?selections=chain&key=${process.env.TORN_API_KEY}`,
    method: 'GET'
  };
  
  const req = https.request(options, res => {
    let data = '';
    
    res.on('data', chunk => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const parsedData = JSON.parse(data);
        
        if (parsedData.error) {
          logError('Torn API error:', parsedData.error);
          // Schedule next fetch
          if (!fallbackTimer) {
            fallbackTimer = setTimeout(() => {
              fallbackTimer = null;
              fetchChainDataFallback(callback);
            }, FALLBACK_INTERVAL);
          }
          return;
        }
        
        // Add timestamp and source info
        parsedData.lastUpdate = Date.now();
        parsedData.source = 'REST API';
        
        // Process the data
        callback(parsedData);
        
        // Also process chain data with the chain monitor if available
        if (chainMonitor && chainMonitor.processChainData) {
          try {
            // Pass through the client for Discord access
            const client = global.discordClient;
            if (client) {
              chainMonitor.processChainData(client, parsedData);
            }
          } catch (error) {
            // Silently continue if chain monitoring fails
            // This ensures the main bot functionality isn't affected
          }
        }
        
        // Schedule next fetch
        if (!fallbackTimer) {
          fallbackTimer = setTimeout(() => {
            fallbackTimer = null;
            fetchChainDataFallback(callback);
          }, FALLBACK_INTERVAL);
        }
      } catch (error) {
        logError('Error parsing Torn API response:', error);
        // Schedule next fetch
        if (!fallbackTimer) {
          fallbackTimer = setTimeout(() => {
            fallbackTimer = null;
            fetchChainDataFallback(callback);
          }, FALLBACK_INTERVAL);
        }
      }
    });
  });
  
  req.on('error', error => {
    logError('Torn API request error:', error);
    // Schedule next fetch
    if (!fallbackTimer) {
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        fetchChainDataFallback(callback);
      }, FALLBACK_INTERVAL);
    }
  });
  
  req.end();
}

/**
 * Manually reconnect to the Torn API
 * @param {Function} callback - Function to call when data is received
 */
function reconnectTornWS(callback) {
  log('Manually reconnecting to Torn API...');
  
  // Clear timers
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  
  // Reset WebSocket
  if (ws) {
    try {
      ws.terminate();
      ws = null;
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
  
  // Reset state
  reconnectAttempts = 0;
  fallbackMode = false;
  
  // Start fresh
  startTornWS(callback);
}

/**
 * Reset all connections and start fresh
 * @param {Function} callback - Function to call when data is received 
 */
function resetAllConnections(callback) {
  log('Performing full reset of all Torn API connections...');
  
  // Clean up everything
  if (ws) {
    try {
      ws.terminate();
      ws = null;
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
  
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  
  // Reset all state
  reconnectAttempts = 0;
  fallbackMode = true; // Start with fallback for reliability
  lastFallbackFetch = 0;
  
  // Start fresh with fallback first for immediate data
  fetchChainDataFallback(callback);
  
  // Try WebSocket connection in the background
  setTimeout(() => {
    fallbackMode = false;
    startTornWS(callback);
  }, 5000);
}

module.exports = {
  startTornWS,
  reconnectTornWS,
  resetAllConnections
};
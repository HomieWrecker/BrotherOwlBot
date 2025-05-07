/**
 * WebSocket connectivity module for Torn API
 * Maintains connection and handles data streaming
 */
const WebSocket = require('ws');
const { log, logError, logWarning } = require('./utils/logger');
const https = require('https');

// Import chain monitor
let chainMonitor = null;
try {
  chainMonitor = require('./services/chain-monitor');
  log('Chain monitoring service loaded');
} catch (error) {
  // Silently continue if the module doesn't exist
}

// Connection state
let ws = null;
let reconnectTimer = null;
let fallbackTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 5000; // 5 seconds
const FALLBACK_INTERVAL = 15000; // 15 seconds - faster for reliability
let lastApiKey = null;

/**
 * Starts WebSocket connection to the Torn API
 * @param {Function} callback - Function to call when data is received
 */
function startTornWS(callback) {
  // Initialize
  reconnectAttempts = 0;
  
  // Close existing connection if any
  if (ws) {
    try {
      ws.terminate();
    } catch (error) {
      // Silently continue
    }
    ws = null;
  }
  
  // Clear any existing timers
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }

  lastApiKey = process.env.TORN_API_KEY;
  
  // Let's start with the fallback mechanism first for immediate data
  fetchChainDataFallback(callback);
  
  // Try WebSocket after a small delay
  setTimeout(() => {
    connectWebSocket(callback);
  }, 1000);
  
  return { status: 'connecting' };
}

/**
 * Connect to Torn API WebSocket (Note: Currently Torn API does not support WebSocket connections)
 * This function will try to connect but will seamlessly fall back to HTTP
 * @param {Function} callback - Function to call when data is received
 */
function connectWebSocket(callback) {
  // Given persistent issues with the WebSocket endpoint, log but don't attempt to connect
  log('WebSocket connection to Torn API is currently not supported. Using HTTP polling...');
  
  // Instead of attempting and failing, we just rely on the HTTP fallback
  // Still keeping the function for future compatibility if Torn enables WebSocket support
    
  // Let's track a failed attempt to ensure we don't retry too often
  reconnectAttempts++;
  
  // After MAX_RECONNECT_ATTEMPTS, we'll wait longer before trying WebSocket again
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logWarning(`Maximum WebSocket reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Relying on HTTP polling.`);
    
    // Try again after a long delay in case WebSocket support is added
    reconnectTimer = setTimeout(() => {
      // Reset attempts and try again later
      reconnectAttempts = 0;
      
      // Don't even try to connect - simply log and rely on HTTP
      log('Periodic check for WebSocket support (unlikely to succeed)');
    }, 900000); // 15 minutes
  } else {
    // Schedule another attempt after a delay
    reconnectTimer = setTimeout(() => {
      // Don't even try to connect - simply log and rely on HTTP
      log(`WebSocket attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} (unlikely to succeed)`);
    }, RECONNECT_DELAY * reconnectAttempts);
  }
}

/**
 * Fetch chain data via HTTP API (fallback method)
 * @param {Function} callback - Function to call when data is received
 */
function fetchChainDataFallback(callback) {
  // Clear any existing timers
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  
  log('Fetching chain data via REST API (fallback mode)');
  
  // Use a try-catch block to ensure any issues don't crash the app
  try {
    const options = {
      hostname: 'api.torn.com',
      path: `/faction/?selections=chain&key=${lastApiKey || process.env.TORN_API_KEY}`,
      method: 'GET',
      timeout: 10000, // 10-second timeout
      headers: {
        'User-Agent': 'BrotherOwlManager Discord Bot'
      }
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
            logError('Torn REST API error:', parsedData.error);
            // Schedule next fallback attempt
            fallbackTimer = setTimeout(() => fetchChainDataFallback(callback), FALLBACK_INTERVAL);
            return;
          }
          
          // Format data to match WebSocket format
          const formattedData = { 
            chain: parsedData.chain || {},
            faction: parsedData.faction || { ID: parsedData.ID },
            lastUpdate: Date.now(),
            source: 'http'
          };
          
          // Process the data
          callback(formattedData);
          
          // Also process chain data with the chain monitor if available
          if (chainMonitor && chainMonitor.processChainData) {
            try {
              // Pass through the client for Discord access
              const client = global.discordClient;
              if (client) {
                chainMonitor.processChainData(client, formattedData);
              }
            } catch (error) {
              logError('Error in chain monitor during fallback update:', error);
            }
          }
          
          // Schedule next fallback update - ensure fallback always continues
          fallbackTimer = setTimeout(() => fetchChainDataFallback(callback), FALLBACK_INTERVAL);
        } catch (err) {
          logError('Error parsing REST API response:', err);
          // Schedule next fallback attempt - ensure fallback always continues
          fallbackTimer = setTimeout(() => fetchChainDataFallback(callback), FALLBACK_INTERVAL);
        }
      });
      
      // Handle response timeout
      res.on('timeout', () => {
        logError('REST API response timeout');
        req.abort();
        // Schedule retry
        fallbackTimer = setTimeout(() => fetchChainDataFallback(callback), FALLBACK_INTERVAL);
      });
    });
    
    // Set request timeout
    req.setTimeout(10000, () => {
      logError('REST API request timeout');
      req.abort();
      // Schedule retry
      fallbackTimer = setTimeout(() => fetchChainDataFallback(callback), FALLBACK_INTERVAL);
    });
    
    req.on('error', error => {
      logError('REST API request error:', error);
      // Schedule retry - ensure fallback always continues
      fallbackTimer = setTimeout(() => fetchChainDataFallback(callback), FALLBACK_INTERVAL);
    });
    
    req.end();
  } catch (error) {
    logError('Critical error in fetchChainDataFallback:', error);
    // Even if everything fails, keep trying
    fallbackTimer = setTimeout(() => fetchChainDataFallback(callback), FALLBACK_INTERVAL);
  }
}

/**
 * Get additional data from the Torn API
 * @param {string} endpoint - API endpoint (user, faction, etc.)
 * @param {string} selections - Comma-separated list of selections
 * @param {string} apiKey - API key to use
 * @returns {Promise<Object>} API response data
 */
function getAdditionalData(endpoint, selections, apiKey = process.env.TORN_API_KEY) {
  return new Promise((resolve, reject) => {
    try {
      const options = {
        hostname: 'api.torn.com',
        path: `/${endpoint}/?selections=${selections}&key=${apiKey}`,
        method: 'GET',
        timeout: 10000, // 10-second timeout
        headers: {
          'User-Agent': 'BrotherOwlManager Discord Bot'
        }
      };
      
      const req = https.request(options, res => {
        let data = '';
        
        res.on('data', chunk => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (!data || data.trim() === '') {
              reject(new Error('Empty response from Torn API'));
              return;
            }
            
            const parsedData = JSON.parse(data);
            
            if (parsedData.error) {
              reject(parsedData.error);
              return;
            }
            
            resolve(parsedData);
          } catch (error) {
            logError(`Error parsing API response from ${endpoint}:`, error);
            reject(error);
          }
        });
      });
      
      // Set request timeout
      req.setTimeout(10000, () => {
        logError(`API request timeout for ${endpoint}`);
        req.abort();
        reject(new Error('API request timeout'));
      });
      
      req.on('error', error => {
        logError(`API request error for ${endpoint}:`, error);
        reject(error);
      });
      
      req.end();
    } catch (error) {
      logError(`Critical error in API request for ${endpoint}:`, error);
      reject(error);
    }
  });
}

/**
 * Manually reconnect the WebSocket
 * @param {Function} callback - Function to call when data is received
 */
function reconnectTornWS(callback) {
  log('Manually reconnecting to Torn API...');
  
  // Clean up existing resources
  if (ws) {
    try {
      ws.terminate();
    } catch (error) {
      // Silently continue
    }
    ws = null;
  }
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  
  // Reset reconnect attempts
  reconnectAttempts = 0;
  
  // Start with the fallback for immediate data
  fetchChainDataFallback(callback);
  
  // Try WebSocket after a small delay
  setTimeout(() => {
    connectWebSocket(callback);
  }, 1000);
}

/**
 * Reset all connections and start fresh
 * @param {Function} callback - Function to call when data is received 
 */
function resetAllConnections(callback) {
  log('Performing full reset of all Torn API connections...');
  
  // Clean up existing resources
  if (ws) {
    try {
      ws.terminate();
    } catch (error) {
      // Silently continue
    }
    ws = null;
  }
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  
  // Reset reconnect attempts
  reconnectAttempts = 0;
  
  // Start with the fallback for immediate data
  fetchChainDataFallback(callback);
  
  // Try WebSocket after a small delay
  setTimeout(() => {
    connectWebSocket(callback);
  }, 1000);
}

module.exports = {
  startTornWS,
  reconnectTornWS,
  resetAllConnections,
  getAdditionalData
};
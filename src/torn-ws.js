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
const FALLBACK_INTERVAL = 30000; // 30 seconds
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
  
  // Connect WebSocket
  connectWebSocket(callback);
  
  // Start fallback timer for reliability
  fetchChainDataFallback(callback);
  
  return { ws, status: 'connecting' };
}

/**
 * Connect to Torn API WebSocket with improved error handling
 * @param {Function} callback - Function to call when data is received
 */
function connectWebSocket(callback) {
  log('Connecting to Torn API WebSocket...');
  
  try {
    // Cleanup any existing connection first
    if (ws) {
      try {
        ws.terminate();
      } catch (error) {
        // Silently continue
      }
      ws = null;
    }
    
    // Initialize a new connection with a timeout
    ws = new WebSocket('wss://api.torn.com/wss/', {
      handshakeTimeout: 10000 // 10 second timeout for initial connection
    });
    
    // Set up a connection timeout
    const connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        logWarning('WebSocket connection timeout. Falling back to HTTP polling.');
        try {
          ws.terminate();
        } catch (error) {
          // Silently continue
        }
        ws = null;
        
        // Fall back to HTTP
        fetchChainDataFallback(callback);
      }
    }, 15000); // 15 seconds timeout
    
    // Connection opened
    ws.on('open', () => {
      log('Connected to Torn WebSocket API');
      reconnectAttempts = 0;
      
      // Clear timeout since we're connected
      clearTimeout(connectionTimeout);
      
      // Send authentication message
      const authMessage = {
        key: lastApiKey || process.env.TORN_API_KEY,
        channel: 'Faction:Chain'
      };
      
      try {
        ws.send(JSON.stringify(authMessage));
      } catch (error) {
        logError('Error sending authentication message:', error);
        
        // If there's an error here, terminate and fall back
        try {
          ws.terminate();
        } catch (innerError) {
          // Silently continue
        }
        ws = null;
        
        // Fall back to HTTP if we can't authenticate
        fetchChainDataFallback(callback);
      }
    });
    
    // Listen for messages
    ws.on('message', (data) => {
      try {
        // Reset reconnect attempts since we're receiving data
        reconnectAttempts = 0;
        
        // Try to parse the data
        const parsedData = JSON.parse(data);
        
        // Add timestamp for when data was last received
        parsedData.lastUpdate = Date.now();
        parsedData.source = 'websocket';
        
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
            // Log but continue if chain monitoring fails
            logError('Error in chain monitor during websocket update:', error);
          }
        }
      } catch (error) {
        logError('Error parsing WebSocket message:', error);
      }
    });
    
    // Handle errors
    ws.on('error', (error) => {
      clearTimeout(connectionTimeout); // Clear the timeout
      logError('Torn WebSocket error:', error);
    });
    
    // Connection closed, attempt to reconnect
    ws.on('close', (code, reason) => {
      clearTimeout(connectionTimeout); // Clear the timeout
      log(`Torn WebSocket connection closed. Code: ${code}, Reason: ${reason || ''}`);
      
      // Connection closed, start reconnect process
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = RECONNECT_DELAY * reconnectAttempts;
        log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay / 1000} seconds...`);
        
        reconnectTimer = setTimeout(() => {
          connectWebSocket(callback);
        }, delay);
      } else {
        logWarning(`Maximum reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Falling back to HTTP polling.`);
        fetchChainDataFallback(callback);
      }
    });
    
    // Setup a ping check to detect zombie connections
    const pingInterval = setInterval(() => {
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          // Connection is open, but check if we've received data recently
          const lastUpdateTime = global.discordClient?.tornData?.lastUpdate || 0;
          const timeSinceUpdate = Date.now() - lastUpdateTime;
          
          if (timeSinceUpdate > 300000) { // 5 minutes
            logWarning('WebSocket connection appears to be stale. No data received in 5 minutes.');
            
            // Force reconnection
            try {
              ws.terminate();
            } catch (error) {
              // Silently continue
            }
            ws = null;
            
            clearInterval(pingInterval);
            reconnectTornWS(callback);
          }
        } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          // Connection is already closed/closing
          clearInterval(pingInterval);
        }
      } else {
        // WebSocket object no longer exists
        clearInterval(pingInterval);
      }
    }, 60000); // Check every minute
    
  } catch (error) {
    logError('Error creating WebSocket connection:', error);
    
    // If we can't create a WebSocket, fall back to HTTP
    logWarning('Falling back to HTTP polling due to WebSocket creation error.');
    fetchChainDataFallback(callback);
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
      timeout: 10000 // 10-second timeout
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
              // Silently continue if chain monitoring fails
              // This ensures the main bot functionality isn't affected
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
      });
    });
    
    // Set request timeout
    req.setTimeout(10000, () => {
      logError('REST API request timeout');
      req.abort();
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
        timeout: 10000 // 10-second timeout
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
        
        // Handle response timeout
        res.on('timeout', () => {
          logError(`API response timeout for ${endpoint}`);
          req.abort();
          reject(new Error('API response timeout'));
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
  log('Manually reconnecting to Torn API WebSocket...');
  
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
  
  // Start fresh
  connectWebSocket(callback);
  
  // Also start fallback timer for reliability
  fetchChainDataFallback(callback);
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
  
  // Start fresh
  connectWebSocket(callback);
  
  // Also start fallback timer for reliability
  fetchChainDataFallback(callback);
}

module.exports = {
  startTornWS,
  reconnectTornWS,
  resetAllConnections,
  getAdditionalData
};
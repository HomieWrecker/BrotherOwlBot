/**
 * Enhanced Torn API connectivity module
 * Uses intelligent HTTP requests with optimized rate limiting
 * prioritizing real-time data for critical updates.
 */
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

// Rate limiting constants for different endpoints
const RATE_LIMITS = {
  CHAIN: 30000,       // 30 seconds - Chain status is high-priority
  ATTACKS: 15000,     // 15 seconds - Recent attacks
  DEFAULT: 60000      // 1 minute - General safety rate limit
};

// Connection state tracking
let lastRequestTime = {};
let updateTimer = null;
let healthCheckTimer = null;
let globalCallback = null;

/**
 * Starts data connection to the Torn API with intelligent HTTP polling
 * @param {Function} callback - Function to call when data is received
 */
function startTornWS(callback) {
  globalCallback = callback;
  
  // Initialize timer state
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  
  // Start polling for chain data
  log('Starting Torn API data service with intelligent HTTP polling');
  fetchChainData(callback);
  
  // Start health check for connection monitoring
  startHealthCheck(callback);
  
  return { status: 'running' };
}

/**
 * Fetch chain data via optimized HTTP
 * @param {Function} callback - Function to call when data is received
 */
function fetchChainData(callback) {
  // Clear existing timer
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  
  // Implement rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - (lastRequestTime.chain || 0);
  
  if (timeSinceLastRequest < RATE_LIMITS.CHAIN) {
    // If we've fetched too recently, schedule next update respecting the rate limit
    const delay = RATE_LIMITS.CHAIN - timeSinceLastRequest;
    log(`Rate limiting chain request. Next update in ${delay}ms`);
    updateTimer = setTimeout(() => fetchChainData(callback), delay);
    return;
  }
  
  // Update last request time
  lastRequestTime.chain = now;
  
  log('Fetching chain data via REST API');
  
  // Build request options
  const options = {
    hostname: 'api.torn.com',
    path: `/faction/?selections=chain&key=${process.env.TORN_API_KEY}`,
    method: 'GET',
    timeout: 10000 // 10 second timeout
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
          // Schedule next attempt even if there was an error
          updateTimer = setTimeout(() => fetchChainData(callback), RATE_LIMITS.CHAIN);
          return;
        }
        
        // Format data consistently
        const formattedData = { 
          chain: parsedData.chain || {},
          faction: parsedData.faction || { ID: parsedData.ID },
          lastUpdate: Date.now(),
          source: 'http'
        };
        
        // Make the data available in the API service for the connection command
        if (!global.apiConnectionData) {
          global.apiConnectionData = {};
        }
        global.apiConnectionData.lastData = formattedData;
        global.apiConnectionData.lastSuccessfulRequest = Date.now();
        global.apiConnectionData.requestStats = {
          ...lastRequestTime,
          totalRequests: (global.apiConnectionData.requestStats?.totalRequests || 0) + 1
        };
        
        // Process with callback (for main bot functionality)
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
          }
        }
        
        // Schedule next update - potentially use a dynamic interval based on chain status
        // If chain is active, we might want more frequent updates
        let nextInterval = RATE_LIMITS.CHAIN;
        
        // If chain is active (has current data), poll more frequently
        if (formattedData.chain && formattedData.chain.current > 0) {
          // Use a shorter interval for active chains but not less than 15 seconds
          nextInterval = Math.max(15000, RATE_LIMITS.CHAIN / 2);
          log('Chain is active - using shorter polling interval');
        }
        
        updateTimer = setTimeout(() => fetchChainData(callback), nextInterval);
      } catch (err) {
        logError('Error parsing REST API response:', err);
        // Schedule next attempt even if there was an error
        updateTimer = setTimeout(() => fetchChainData(callback), RATE_LIMITS.CHAIN);
      }
    });
  });
  
  // Additional timeout handling
  req.setTimeout(10000, () => {
    req.abort();
    logError('REST API request timed out after 10 seconds');
    // Schedule retry
    updateTimer = setTimeout(() => fetchChainData(callback), RATE_LIMITS.CHAIN);
  });
  
  req.on('error', error => {
    logError('REST API request error:', error);
    // Schedule retry
    updateTimer = setTimeout(() => fetchChainData(callback), RATE_LIMITS.CHAIN);
  });
  
  req.end();
}

/**
 * Start health check to monitor API connectivity
 * @param {Function} callback - Function to call when data is received
 */
function startHealthCheck(callback) {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }
  
  log('Starting API connection health check service');
  
  healthCheckTimer = setInterval(() => {
    // Check if we have recent data
    const now = Date.now();
    const lastSuccessful = global.apiConnectionData?.lastSuccessfulRequest || 0;
    
    // If it's been over 2 minutes since our last successful request, force a fetch
    if (now - lastSuccessful > 120000) {
      log('Health check: No recent data, forcing API update');
      
      // Force immediate update
      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = null;
      }
      
      // Reset request tracking to force immediate fetch
      lastRequestTime.chain = 0;
      fetchChainData(callback || globalCallback);
    }
  }, 60000); // Check every minute
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
    // Implement rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - (lastRequestTime[endpoint] || 0);
    const rateLimit = RATE_LIMITS[endpoint.toUpperCase()] || RATE_LIMITS.DEFAULT;
    
    if (timeSinceLastRequest < rateLimit) {
      // If we've fetched too recently, delay the request
      const delay = rateLimit - timeSinceLastRequest;
      log(`Rate limiting ${endpoint} request. Delaying by ${delay}ms`);
      
      setTimeout(() => {
        getAdditionalData(endpoint, selections, apiKey)
          .then(resolve)
          .catch(reject);
      }, delay);
      return;
    }
    
    // Update last request time
    lastRequestTime[endpoint] = now;
    
    // Build request options
    const options = {
      hostname: 'api.torn.com',
      path: `/${endpoint}/?selections=${selections}&key=${apiKey}`,
      method: 'GET',
      timeout: 10000 // 10 second timeout
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
            reject(parsedData.error);
            return;
          }
          
          // Add metadata
          parsedData.lastUpdate = Date.now();
          parsedData.source = 'http';
          
          // Update global stats
          if (!global.apiConnectionData) {
            global.apiConnectionData = {};
          }
          if (!global.apiConnectionData.requestStats) {
            global.apiConnectionData.requestStats = {};
          }
          global.apiConnectionData.requestStats.totalRequests = 
            (global.apiConnectionData.requestStats.totalRequests || 0) + 1;
          
          resolve(parsedData);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', error => {
      reject(error);
    });
    
    req.end();
  });
}

/**
 * Manually reconnect the API services
 * @param {Function} callback - Function to call when data is received
 */
function reconnectTornWS(callback) {
  log('Manually reconnecting to Torn API services...');
  
  // Clean up existing resources
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  
  // Reset request tracking to force immediate fetch
  lastRequestTime = {};
  
  // Start fresh polling
  fetchChainData(callback || globalCallback);
  
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
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  
  // Reset all state
  lastRequestTime = {};
  
  // If global connection stats exist, reset most values but keep totals
  if (global.apiConnectionData) {
    const totalRequests = global.apiConnectionData.requestStats?.totalRequests || 0;
    global.apiConnectionData = {
      requestStats: {
        totalRequests,
        resetCount: (global.apiConnectionData.requestStats?.resetCount || 0) + 1
      }
    };
  }
  
  // Start fresh polling
  fetchChainData(callback || globalCallback);
  
  // Restart health check
  startHealthCheck(callback || globalCallback);
}

module.exports = {
  startTornWS,
  reconnectTornWS,
  resetAllConnections
};

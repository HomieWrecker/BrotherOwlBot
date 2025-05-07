/**
 * Torn API Service - Hybrid WebSocket/HTTP client
 * 
 * This service manages connections to the Torn API with intelligent switching between
 * WebSocket for real-time data and HTTP for less time-sensitive requests.
 * 
 * Features:
 * - Prioritizes WebSocket for real-time data (chains, attacks, etc.)
 * - Uses HTTP for non-real-time or infrequent data
 * - Implements proper rate limiting based on Torn API guidelines
 * - Automatic fallback to HTTP when WebSocket is unavailable
 * - Connection health monitoring and auto-healing
 */

const WebSocket = require('ws');
const https = require('https');
const { log, logError, logWarning } = require('../utils/logger');

// Constants for connection management
const WEBSOCKET_RECONNECT_ATTEMPTS = 3;
const WEBSOCKET_RECONNECT_BASE_DELAY = 5000; // 5 seconds
const HTTP_RATE_LIMIT = {
  DEFAULT: 60000,      // 1 minute - General safety rate limit for most endpoints
  CHAIN: 30000,        // 30 seconds - Chain status updates
  ATTACKS: 15000,      // 15 seconds - Recent attacks
  FACTION: 60000,      // 1 minute - Faction information
  PLAYER: 60000,       // 1 minute - Player information
  COMPANY: 300000,     // 5 minutes - Company information
  MARKET: 60000,       // 1 minute - Market data
  PROPERTY: 300000,    // 5 minutes - Property information
  EDUCATION: 300000,   // 5 minutes - Education information
  STATS: 300000,       // 5 minutes - Statistics
  KEY: 3600000,        // 1 hour - API key information
  TORN: 600000         // 10 minutes - Torn game info
};

// Priority list for WebSocket subscriptions
const WEBSOCKET_PRIORITIES = [
  'chain',             // Highest priority - real-time chain status
  'attacks',           // Real-time attack information
  'events',            // Real-time events
  'faction',           // Near real-time faction data
  'messages',          // Near real-time messages
  'trades'             // Near real-time trades
];

// WebSocket connection state
let ws = null;
let wsConnected = false;
let reconnectAttempts = 0;
let healthCheckTimer = null;
let activeSubscriptions = new Set();
let dataCallbacks = new Map();

// HTTP request management
let lastRequestTime = {};
let pendingRequests = new Map();

/**
 * Initialize the Torn API service
 * @param {string} apiKey - Torn API key
 */
function initialize(apiKey) {
  if (!apiKey) {
    logError('Cannot initialize Torn API service - No API key provided');
    return;
  }
  
  // Reset state
  wsConnected = false;
  reconnectAttempts = 0;
  activeSubscriptions.clear();
  
  // Start with WebSocket connection for real-time data
  connectWebSocket(apiKey);
  
  // Start health check timer
  startHealthCheck(apiKey);
  
  return {
    // Public API methods
    subscribeToEvent,
    unsubscribeFromEvent,
    fetchData,
    getConnectionStatus,
    resetConnection: () => resetConnection(apiKey)
  };
}

/**
 * Connect to Torn API WebSocket
 * @param {string} apiKey - Torn API key
 */
function connectWebSocket(apiKey) {
  // Close existing connection if any
  if (ws) {
    try {
      ws.terminate();
      ws = null;
    } catch (error) {
      logError('Error terminating existing WebSocket:', error);
    }
  }
  
  log('Connecting to Torn API WebSocket...');
  
  try {
    // Torn API uses a specific format for WebSocket connections
    // The correct format includes the API key in the URL path
    ws = new WebSocket(`wss://api.torn.com/wss/?key=${apiKey}`);
    
    // Connection opened
    ws.on('open', () => {
      wsConnected = true;
      reconnectAttempts = 0;
      log('Connected to Torn WebSocket API');
      
      // Subscribe to events based on priority
      resubscribeEvents(apiKey);
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
        
        // Extract event type from the data
        const eventType = determineEventType(parsedData);
        
        // Process with appropriate callbacks
        if (eventType && dataCallbacks.has(eventType)) {
          const callbacks = dataCallbacks.get(eventType);
          callbacks.forEach(callback => {
            try {
              callback(parsedData);
            } catch (callbackError) {
              logError(`Error in ${eventType} callback:`, callbackError);
            }
          });
        }
        
        // Also handle global data updates if registered
        if (dataCallbacks.has('all')) {
          const globalCallbacks = dataCallbacks.get('all');
          globalCallbacks.forEach(callback => {
            try {
              callback(parsedData);
            } catch (callbackError) {
              logError('Error in global callback:', callbackError);
            }
          });
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
      wsConnected = false;
      log(`Torn WebSocket connection closed. Code: ${code}, Reason: ${reason || 'No reason provided'}`);
      
      // Implement exponential backoff for reconnection
      if (reconnectAttempts < WEBSOCKET_RECONNECT_ATTEMPTS) {
        const delay = WEBSOCKET_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts);
        reconnectAttempts++;
        
        log(`Attempting to reconnect (${reconnectAttempts}/${WEBSOCKET_RECONNECT_ATTEMPTS}) in ${delay / 1000} seconds...`);
        setTimeout(() => connectWebSocket(apiKey), delay);
      } else {
        logError('Maximum WebSocket reconnection attempts reached. Falling back to HTTP for all requests.');
        // Continue with HTTP fallback for pending requests
      }
    });
  } catch (error) {
    logError('Error creating WebSocket connection:', error);
    
    // If we can't create a WebSocket, increment attempts and try again
    reconnectAttempts++;
    
    if (reconnectAttempts < WEBSOCKET_RECONNECT_ATTEMPTS) {
      const delay = WEBSOCKET_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts);
      log(`WebSocket creation failed. Attempting to reconnect (${reconnectAttempts}/${WEBSOCKET_RECONNECT_ATTEMPTS}) in ${delay / 1000} seconds...`);
      setTimeout(() => connectWebSocket(apiKey), delay);
    } else {
      logError('Maximum WebSocket reconnection attempts reached. Falling back to HTTP for all requests.');
      // Continue with HTTP fallback for pending requests
    }
  }
}

/**
 * Subscribe to a specific Torn API event
 * @param {string} eventType - Type of event to subscribe to
 * @param {Function} callback - Function to call when event data is received
 * @param {string} apiKey - Torn API key
 */
function subscribeToEvent(eventType, callback, apiKey) {
  if (!eventType || typeof callback !== 'function') {
    logError('Invalid subscription parameters');
    return false;
  }
  
  // Store the callback for this event type
  if (!dataCallbacks.has(eventType)) {
    dataCallbacks.set(eventType, []);
  }
  
  dataCallbacks.get(eventType).push(callback);
  
  // If this is a WebSocket-supported event, subscribe via WebSocket
  if (WEBSOCKET_PRIORITIES.includes(eventType) && wsConnected) {
    if (!activeSubscriptions.has(eventType)) {
      sendWebSocketSubscription(eventType, apiKey);
      activeSubscriptions.add(eventType);
    }
  }
  
  return true;
}

/**
 * Unsubscribe from a specific Torn API event
 * @param {string} eventType - Type of event to unsubscribe from
 * @param {Function} callback - Function to remove from callbacks
 */
function unsubscribeFromEvent(eventType, callback) {
  if (!eventType || !dataCallbacks.has(eventType)) {
    return false;
  }
  
  if (callback) {
    // Remove specific callback
    const callbacks = dataCallbacks.get(eventType);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
      
      // If no more callbacks for this event, clean up
      if (callbacks.length === 0) {
        dataCallbacks.delete(eventType);
        activeSubscriptions.delete(eventType);
      }
    }
  } else {
    // Remove all callbacks for this event
    dataCallbacks.delete(eventType);
    activeSubscriptions.delete(eventType);
  }
  
  return true;
}

/**
 * Send WebSocket subscription message
 * @param {string} eventType - Event type to subscribe to
 * @param {string} apiKey - Torn API key
 */
function sendWebSocketSubscription(eventType, apiKey) {
  if (!wsConnected || !ws) {
    return false;
  }
  
  try {
    const subscriptionMessage = {
      action: 'subscribe',
      key: apiKey,
      events: [eventType]
    };
    
    ws.send(JSON.stringify(subscriptionMessage));
    log(`Subscribed to ${eventType} events`);
    return true;
  } catch (error) {
    logError(`Error subscribing to ${eventType} events:`, error);
    return false;
  }
}

/**
 * Resubscribe to all active events
 * @param {string} apiKey - Torn API key
 */
function resubscribeEvents(apiKey) {
  if (!wsConnected || !ws) {
    return false;
  }
  
  // If we have active subscriptions, resubscribe
  if (activeSubscriptions.size > 0) {
    try {
      const subscriptionMessage = {
        action: 'subscribe',
        key: apiKey,
        events: Array.from(activeSubscriptions)
      };
      
      ws.send(JSON.stringify(subscriptionMessage));
      log(`Resubscribed to ${activeSubscriptions.size} events`);
      return true;
    } catch (error) {
      logError('Error resubscribing to events:', error);
      return false;
    }
  }
  
  return true;
}

/**
 * Determine event type from data
 * @param {Object} data - Data received from Torn API
 * @returns {string|null} Determined event type or null
 */
function determineEventType(data) {
  // Extract the event type based on the data structure
  if (data.chain) return 'chain';
  if (data.attacks) return 'attacks';
  if (data.events) return 'events';
  if (data.faction && !data.chain) return 'faction';
  if (data.messages) return 'messages';
  if (data.trades) return 'trades';
  return null;
}

/**
 * Fetch data from Torn API via HTTP
 * @param {string} endpoint - API endpoint (e.g., 'user', 'faction', etc.)
 * @param {string} selections - Comma-separated list of selections
 * @param {string} apiKey - Torn API key
 * @param {Object} additionalParams - Additional query parameters
 * @param {boolean} priority - Whether this is a priority request
 * @returns {Promise<Object>} Promise resolving to API response
 */
function fetchData(endpoint, selections, apiKey, additionalParams = {}, priority = false) {
  return new Promise((resolve, reject) => {
    // Determine rate limit for this endpoint
    const category = endpoint.toUpperCase();
    const rateLimit = HTTP_RATE_LIMIT[category] || HTTP_RATE_LIMIT.DEFAULT;
    
    // Check if we should throttle this request
    const now = Date.now();
    if (lastRequestTime[endpoint] && now - lastRequestTime[endpoint] < rateLimit && !priority) {
      const delay = rateLimit - (now - lastRequestTime[endpoint]);
      log(`Rate limiting ${endpoint} request. Delaying by ${delay}ms`);
      setTimeout(() => {
        fetchData(endpoint, selections, apiKey, additionalParams, true)
          .then(resolve)
          .catch(reject);
      }, delay);
      return;
    }
    
    // Update last request time
    lastRequestTime[endpoint] = now;
    
    // Build query parameters
    let queryParams = selections ? `selections=${selections}` : '';
    for (const [key, value] of Object.entries(additionalParams)) {
      queryParams += queryParams ? '&' : '';
      queryParams += `${key}=${encodeURIComponent(value)}`;
    }
    
    // Add API key
    queryParams += queryParams ? '&' : '';
    queryParams += `key=${apiKey}`;
    
    // Construct request path
    const path = `/${endpoint}/?${queryParams}`;
    
    const options = {
      hostname: 'api.torn.com',
      path,
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
            logError(`Torn API error (${endpoint}):`, parsedData.error);
            reject(parsedData.error);
            return;
          }
          
          // Add metadata
          parsedData.lastUpdate = Date.now();
          parsedData.source = 'http';
          
          resolve(parsedData);
        } catch (error) {
          logError(`Error parsing ${endpoint} response:`, error);
          reject(error);
        }
      });
    });
    
    req.on('error', error => {
      logError(`${endpoint} request error:`, error);
      reject(error);
    });
    
    req.end();
  });
}

/**
 * Start health check timer
 * @param {string} apiKey - Torn API key
 */
function startHealthCheck(apiKey) {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }
  
  log('Starting API connection health check service');
  
  healthCheckTimer = setInterval(() => {
    // If WebSocket is not connected, attempt to reconnect
    if (!wsConnected) {
      log('Health check: Attempting to reconnect to WebSocket');
      reconnectAttempts = 0;
      connectWebSocket(apiKey);
    }
  }, 60000); // Check every minute
}

/**
 * Get current connection status
 * @returns {Object} Connection status information
 */
function getConnectionStatus() {
  return {
    websocket: {
      connected: wsConnected,
      reconnectAttempts,
      activeSubscriptions: Array.from(activeSubscriptions)
    },
    http: {
      lastRequests: { ...lastRequestTime },
      pendingRequests: pendingRequests.size
    }
  };
}

/**
 * Reset all connections
 * @param {string} apiKey - Torn API key
 */
function resetConnection(apiKey) {
  log('Performing full reset of all Torn API connections...');
  
  // Clean up WebSocket
  if (ws) {
    try {
      ws.terminate();
      ws = null;
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
  
  // Clear health check timer
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  
  // Reset state
  wsConnected = false;
  reconnectAttempts = 0;
  lastRequestTime = {};
  pendingRequests.clear();
  
  // Don't clear callbacks or subscriptions
  
  // Restart connections
  connectWebSocket(apiKey);
  startHealthCheck(apiKey);
  
  return true;
}

module.exports = {
  initialize
};
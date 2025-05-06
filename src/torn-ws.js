const WebSocket = require('ws');
const { log, logError, logWarning } = require('./utils/logger');
const https = require('https');

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3; // Reduced WebSocket attempts
const RECONNECT_DELAY_BASE = 5000; // 5 seconds

// REST API is now the primary method since WebSocket has been unreliable
let fallbackMode = true; // Start with REST API by default
let lastFallbackFetch = 0;
const FALLBACK_INTERVAL = 30000; // 30 seconds between API calls for more frequent updates

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
        callback(parsedData);
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
        setTimeout(() => startTornWS(callback), delay);
      } else {
        logError('Maximum reconnection attempts reached. Switching to fallback REST API mode.');
        fallbackMode = true;
        fetchChainDataFallback(callback);
      }
    });

    return ws;
  } catch (err) {
    logError('Error creating WebSocket:', err);
    
    // If we can't create a WebSocket, increment attempts and try again or switch to fallback
    reconnectAttempts++;
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts);
      log(`WebSocket creation failed. Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay / 1000} seconds...`);
      setTimeout(() => startTornWS(callback), delay);
    } else {
      logError('Maximum reconnection attempts reached. Switching to fallback REST API mode.');
      fallbackMode = true;
      fetchChainDataFallback(callback);
    }
    
    return null;
  }
}

/**
 * Fetch chain data via REST API
 * @param {Function} callback - Function to call when data is received
 */
function fetchChainDataFallback(callback) {
  const now = Date.now();
  
  // Throttle API calls to prevent rate limiting
  if (now - lastFallbackFetch < FALLBACK_INTERVAL) {
    return;
  }
  
  lastFallbackFetch = now;
  
  const mode = fallbackMode ? '(fallback mode)' : '(primary mode)';
  log(`Fetching chain data via REST API ${mode}`);
  
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
          logError('Torn REST API error:', parsedData.error);
          return;
        }
        
        // Format data to match WebSocket format
        const formattedData = { 
          chain: parsedData.chain || {},
          lastUpdate: Date.now(),
          source: 'fallback'
        };
        callback(formattedData);
        
        // Schedule next update
        setTimeout(() => fetchChainDataFallback(callback), FALLBACK_INTERVAL);
      } catch (err) {
        logError('Error parsing REST API response:', err);
      }
    });
  });
  
  req.on('error', error => {
    logError('REST API request error:', error);
  });
  
  req.end();
}

/**
 * Manually reconnect the WebSocket connection
 * @param {Function} callback - Function to call when data is received
 */
function reconnectTornWS(callback) {
  log('Manually reconnecting to Torn WebSocket API...');
  reconnectAttempts = 0;
  fallbackMode = false;
  startTornWS(callback);
}

module.exports = {
  startTornWS,
  reconnectTornWS
};

/**
 * Keep-alive service for Replit
 * This helps keep the bot running 24/7 by preventing Replit from putting it to sleep
 * Not needed for Synology NAS deployment
 */

const http = require('http');
const https = require('https');
const { log, logError } = require('./src/utils/logger');

let keepAliveServer = null;
let pingInterval = null;

// Create a simple HTTP server
function createServer(port) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('BrotherOwlManager is running!');
  });
  
  // Add error handling
  server.on('error', (error) => {
    logError('Keep-alive server error:', error);
    
    // If port is already in use, try another port
    if (error.code === 'EADDRINUSE') {
      log(`Port ${port} is already in use, trying ${port + 1}`);
      setTimeout(() => {
        if (server) {
          try {
            server.close();
          } catch (e) {
            // Ignore errors during close
          }
        }
        startKeepAliveServer(port + 1);
      }, 1000);
    }
  });
  
  return server;
}

// Ping self to keep alive
function setupPinger(port) {
  // Clear any existing interval
  if (pingInterval) {
    clearInterval(pingInterval);
  }
  
  // Set up a new interval
  pingInterval = setInterval(() => {
    try {
      http.get(`http://localhost:${port}`, (res) => {
        if (res.statusCode === 200) {
          log('Self-ping successful', true); // hidden log, second param = silent
        } else {
          logError(`Self-ping returned status code: ${res.statusCode}`);
        }
      }).on('error', (err) => {
        logError('Self-ping error:', err);
        // If ping fails, try to restart the keep-alive server
        restartKeepAliveServer(port);
      });
    } catch (error) {
      logError('Error during self-ping:', error);
    }
  }, 60000); // Every minute
}

// Restart the keep-alive server in case of issues
function restartKeepAliveServer(port) {
  log('Restarting keep-alive server...');
  
  if (keepAliveServer) {
    try {
      keepAliveServer.close();
    } catch (e) {
      // Ignore errors during close
    }
  }
  
  keepAliveServer = null;
  startKeepAliveServer(port);
}

// Start the server
function startKeepAliveServer(port = 3000) {
  try {
    // Create new server
    keepAliveServer = createServer(port);
    
    // Start listening
    keepAliveServer.listen(port, () => {
      log(`Keep-alive server running on port ${port}`);
      
      // Set up self-pinging
      setupPinger(port);
    });
  } catch (error) {
    logError('Failed to start keep-alive server:', error);
    
    // Try a different port if something went wrong
    setTimeout(() => {
      startKeepAliveServer(port + 1);
    }, 5000);
  }
}

module.exports = { startKeepAliveServer };
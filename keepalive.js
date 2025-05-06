/**
 * Keep-alive service for Replit
 * This helps keep the bot running 24/7 by preventing Replit from putting it to sleep
 * Not needed for Synology NAS deployment
 */

const http = require('http');
const { log, logError } = require('./src/utils/logger');

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('BrotherOwlManager is running!');
});

// Start the server
function startKeepAliveServer(port = 3000) {
  server.listen(port, () => {
    log(`Keep-alive server running on port ${port}`);
  });
  
  // Handle server errors
  server.on('error', (error) => {
    logError('Keep-alive server error:', error);
    
    // If port is already in use, try another port
    if (error.code === 'EADDRINUSE') {
      log(`Port ${port} is already in use, trying ${port + 1}`);
      setTimeout(() => {
        server.close();
        startKeepAliveServer(port + 1);
      }, 1000);
    }
  });
}

module.exports = { startKeepAliveServer };
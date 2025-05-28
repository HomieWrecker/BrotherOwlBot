// Combined launcher script for Brother Owl bots
// This script manages both bots and ensures they stay online

const { spawn } = require('child_process');
const express = require('express');
const app = express();
const PORT = 3000;

console.log('Starting combined bot launcher...');

// Create an Express server for ping requests
app.get('/', (req, res) => {
  res.send('Brother Owl bots are online!');
});

app.get('/wake', (req, res) => {
  console.log('Wake request received, refreshing bots...');
  res.send('Refreshing bots...');
  restartBots();
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// Store child processes
let jsBot = null;
let pyBot = null;
let isJsRunning = false;
let isPyRunning = false;

// Function to start/restart the JavaScript bot
function startJsBot() {
  if (isJsRunning) return;
  
  console.log('Starting Brother Owl Discord.js bot...');
  jsBot = spawn('node', ['index.js'], {
    stdio: 'inherit',
    detached: false
  });
  
  isJsRunning = true;
  
  jsBot.on('exit', (code) => {
    console.log(`JavaScript bot exited with code ${code}`);
    isJsRunning = false;
    
    // Restart after a delay
    setTimeout(() => {
      startJsBot();
    }, 10000);
  });
}

// Function to start/restart the Python bot
function startPyBot() {
  if (isPyRunning) return;
  
  console.log('Starting Python Spy bot...');
  pyBot = spawn('python', ['bot_package/main.py'], {
    stdio: 'inherit',
    detached: false
  });
  
  isPyRunning = true;
  
  pyBot.on('exit', (code) => {
    console.log(`Python bot exited with code ${code}`);
    isPyRunning = false;
    
    // Restart after a delay
    setTimeout(() => {
      startPyBot();
    }, 15000);
  });
}

// Function to restart both bots
function restartBots() {
  console.log('Restarting all bots...');
  
  // Kill existing processes if they're running
  if (jsBot) {
    try {
      process.kill(-jsBot.pid);
    } catch (error) {
      console.log('JavaScript bot was not running');
    }
    isJsRunning = false;
  }
  
  if (pyBot) {
    try {
      process.kill(-pyBot.pid);
    } catch (error) {
      console.log('Python bot was not running');
    }
    isPyRunning = false;
  }
  
  // Start bots with a delay between them
  setTimeout(() => {
    startJsBot();
    
    // Start Python bot 5 seconds after JS bot
    setTimeout(() => {
      startPyBot();
    }, 5000);
  }, 2000);
}

// Setup health check and auto-restart
setInterval(() => {
  if (!isJsRunning) {
    console.log('JS bot is not running, restarting...');
    startJsBot();
  }
  
  if (!isPyRunning) {
    console.log('Python bot is not running, restarting...');
    startPyBot();
  }
  
  console.log('Health check: JS bot running:', isJsRunning, '| Python bot running:', isPyRunning);
}, 30000);

// Initial bot startup
restartBots();

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('Shutting down all bots...');
  if (jsBot) process.kill(-jsBot.pid);
  if (pyBot) process.kill(-pyBot.pid);
  process.exit(0);
});

console.log('Bot launcher initialized');

// Function to start/restart the Python bot
function startPyBot() {
  if (isPyRunning) return;
  
  console.log('Starting Python Spy bot...');
  
  // Try different Python commands that might be available
  const pythonCommands = ['python3', 'python', '/usr/bin/python3'];
  let pythonCmd = 'python3'; // Default to python3
  
  pyBot = spawn(pythonCmd, ['bot_package/main.py'], {
    stdio: 'inherit',
    detached: false
  });
  
  isPyRunning = true;
  
  pyBot.on('error', (error) => {
    console.log('Python bot failed to start:', error.message);
    isPyRunning = false;
    
    // Don't restart Python bot if it's not available
    if (error.code === 'ENOENT') {
      console.log('Python not available on this system, running JS bot only');
      return;
    }
  });
  
  pyBot.on('exit', (code) => {
    console.log(`Python bot exited with code ${code}`);
    isPyRunning = false;
    
    // Restart after a delay
    setTimeout(() => {
      startPyBot();
    }, 15000);
  });
}

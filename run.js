// Custom launcher script for Render deployment
// Fixes any ownerId formatting issues and starts the combined launcher

const { execSync } = require('child_process');
const fs = require('fs');

console.log('Running pre-launch checks...');

// Run the fix script first
try {
  console.log('Checking for ownerId syntax issues...');
  require('./fix_ownerId');
  console.log('Syntax check complete');
} catch (error) {
  console.error('Error during syntax check:', error);
}

// Then start the combined launcher
console.log('Starting Brother Owl and Owl Eye bots...');
require('./combined_launcher');

// Custom launcher script for Render deployment
// Fixes any ownerId formatting issues and starts the combined launcher

import { execSync } from 'child_process';
import fs from 'fs';

console.log('Running pre-launch checks...');

// Run the fix script first
try {
  console.log('Checking for ownerId syntax issues...');
  await import('./fix_ownerId.js');
  console.log('Syntax check complete');
} catch (error) {
  console.error('Error during syntax check:', error);
}

// Then start the combined launcher
console.log('Starting Brother Owl and Owl Eye bots...');
await import('./combined_launcher.js');

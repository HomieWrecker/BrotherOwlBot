/**
 * Script to fix ownerID syntax errors in config files
 */
const fs = require('fs');
const path = require('path');

// Recursive function to search and fix files in directories
function processDirectory(directory) {
  const items = fs.readdirSync(directory);
  
  for (const item of items) {
    const fullPath = path.join(directory, item);
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      processDirectory(fullPath); // Recursively process subdirectories
    } else if (stats.isFile() && item.endsWith('.js')) {
      fixOwnerIdInFile(fullPath);
    }
  }
}

// Function to fix ownerId in a file
function fixOwnerIdInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check for various mismatched quote patterns
    const patterns = [
      /ownerId:\s*''([0-9]+)"/g,   // ''123" - single quotes with ending double quote
      /ownerId:\s*"'([0-9]+)'/g,   // "'123' - double quote with single quotes
      /ownerId:\s*''([0-9]+)''/g,  // ''123'' - double single quotes
      /ownerId:\s*""([0-9]+)""/g   // ""123"" - double double quotes
    ];
    
    let fixed = false;
    
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, 'ownerId: "$1"');
        fixed = true;
      }
    }
    
    if (fixed) {
      console.log(`Fixed ownerId in: ${filePath}`);
      fs.writeFileSync(filePath, content, 'utf8');
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}: ${error.message}`);
  }
}

// Main execution
console.log("Starting to fix ownerId syntax issues...");
processDirectory('.');
console.log("Completed checking for ownerId syntax issues");
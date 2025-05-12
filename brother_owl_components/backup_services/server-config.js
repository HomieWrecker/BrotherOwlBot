/**
 * Server configuration service for BrotherOwlManager
 * Handles storage and retrieval of server-specific settings
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');

// Configuration storage
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SERVER_CONFIG_FILE = path.join(DATA_DIR, 'server_configs.json');

// Make sure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize server configs
let serverConfigs = {};
try {
  if (fs.existsSync(SERVER_CONFIG_FILE)) {
    serverConfigs = JSON.parse(fs.readFileSync(SERVER_CONFIG_FILE, 'utf8'));
  } else {
    fs.writeFileSync(SERVER_CONFIG_FILE, JSON.stringify(serverConfigs), 'utf8');
  }
} catch (error) {
  logError('Error initializing server configs:', error);
}

/**
 * Get server configuration
 * @param {string} serverId - Discord server ID
 * @returns {Object|null} Server configuration or null if not found
 */
function getServerConfig(serverId) {
  return serverConfigs[serverId] || null;
}

/**
 * Set server configuration
 * @param {string} serverId - Discord server ID
 * @param {Object} config - Configuration object
 * @returns {boolean} Success state
 */
function setServerConfig(serverId, config) {
  try {
    serverConfigs[serverId] = config;
    fs.writeFileSync(SERVER_CONFIG_FILE, JSON.stringify(serverConfigs), 'utf8');
    log(`Updated server config for ${serverId}`);
    return true;
  } catch (error) {
    logError(`Error setting server config for ${serverId}:`, error);
    return false;
  }
}

/**
 * Update specific configuration field
 * @param {string} serverId - Discord server ID
 * @param {string} field - Field to update
 * @param {*} value - New value
 * @returns {boolean} Success state
 */
function updateServerConfig(serverId, field, value) {
  try {
    // Create server config if it doesn't exist
    if (!serverConfigs[serverId]) {
      serverConfigs[serverId] = {};
    }
    
    // Update the specific field
    serverConfigs[serverId][field] = value;
    
    // Save to file
    fs.writeFileSync(SERVER_CONFIG_FILE, JSON.stringify(serverConfigs), 'utf8');
    
    log(`Updated ${field} for server ${serverId}`);
    return true;
  } catch (error) {
    logError(`Error updating server config field ${field} for ${serverId}:`, error);
    return false;
  }
}

/**
 * Get specific configuration value
 * @param {string} serverId - Discord server ID
 * @param {string} field - Field to retrieve
 * @param {*} defaultValue - Default value if not set
 * @returns {*} Configuration value or default if not found
 */
function getServerConfigValue(serverId, field, defaultValue = null) {
  const config = serverConfigs[serverId];
  if (!config || config[field] === undefined) {
    return defaultValue;
  }
  return config[field];
}

/**
 * Check if server has required configuration
 * @param {string} serverId - Discord server ID
 * @returns {boolean} Whether server has the minimum required configuration
 */
function hasRequiredConfig(serverId) {
  const config = serverConfigs[serverId];
  if (!config) return false;
  
  // Check for minimum required fields
  return !!config.factionId && !!config.factionApiKey;
}

/**
 * Delete server configuration
 * @param {string} serverId - Discord server ID
 * @returns {boolean} Success state
 */
function deleteServerConfig(serverId) {
  try {
    if (serverConfigs[serverId]) {
      delete serverConfigs[serverId];
      fs.writeFileSync(SERVER_CONFIG_FILE, JSON.stringify(serverConfigs), 'utf8');
      log(`Deleted server config for ${serverId}`);
      return true;
    }
    return false;
  } catch (error) {
    logError(`Error deleting server config for ${serverId}:`, error);
    return false;
  }
}

module.exports = {
  getServerConfig,
  setServerConfig,
  updateServerConfig,
  getServerConfigValue,
  hasRequiredConfig,
  deleteServerConfig
};
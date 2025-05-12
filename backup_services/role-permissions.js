/**
 * Role Permissions service for BrotherOwlManager
 * Manages role-based access control for bot commands and features
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');

// Data storage paths
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PERMISSIONS_FILE = path.join(DATA_DIR, 'role_permissions.json');

// Default command categories
const COMMAND_CATEGORIES = {
  ADMINISTRATION: 'administration',
  FACTION_INFO: 'faction_info',
  BANK: 'bank',
  CHAIN: 'chain',
  STATS: 'stats',
  WAR: 'war',
  EVENTS: 'events'
};

// Map commands to categories
const COMMAND_CATEGORY_MAP = {
  // Administration commands
  'welcome': COMMAND_CATEGORIES.ADMINISTRATION,
  'botpermissions': COMMAND_CATEGORIES.ADMINISTRATION,
  
  // Faction info commands
  'faction': COMMAND_CATEGORIES.FACTION_INFO,
  'members': COMMAND_CATEGORIES.FACTION_INFO,
  'activity': COMMAND_CATEGORIES.FACTION_INFO,
  
  // Bank commands
  'bank': COMMAND_CATEGORIES.BANK,
  
  // Chain commands
  'chain': COMMAND_CATEGORIES.CHAIN,
  'chainsheet': COMMAND_CATEGORIES.CHAIN,
  
  // Stats commands
  'stats': COMMAND_CATEGORIES.STATS,
  'playerstats': COMMAND_CATEGORIES.STATS,
  'factionstats': COMMAND_CATEGORIES.STATS,
  
  // War commands
  'warcountdown': COMMAND_CATEGORIES.WAR,
  'warstrategy': COMMAND_CATEGORIES.WAR,
  
  // Events commands
  'events': COMMAND_CATEGORIES.EVENTS
};

// Permission levels
const PERMISSION_LEVELS = {
  NONE: 0,        // No access
  USE: 1,         // Can use basic read-only functionality
  CONTRIBUTE: 2,  // Can contribute data and interact
  MANAGE: 3,      // Can manage and configure
  ADMIN: 4        // Full admin access
};

// Role permissions data
let rolePermissions = {};

// Initialize data from file
try {
  if (fs.existsSync(PERMISSIONS_FILE)) {
    rolePermissions = JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
  } else {
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(rolePermissions), 'utf8');
  }
} catch (error) {
  logError('Error loading role permissions:', error);
}

/**
 * Save role permissions to file
 * @returns {boolean} Success or failure
 */
function saveRolePermissions() {
  try {
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(rolePermissions, null, 2), 'utf8');
    return true;
  } catch (error) {
    logError('Error saving role permissions:', error);
    return false;
  }
}

/**
 * Get role permissions for a server
 * @param {string} serverId - Discord server ID
 * @returns {Object} Server role permissions
 */
function getServerPermissions(serverId) {
  if (!rolePermissions[serverId]) {
    rolePermissions[serverId] = {
      enabled: false,
      roles: {},
      categories: {}
    };
    saveRolePermissions();
  }
  
  return rolePermissions[serverId];
}

/**
 * Set permission system enabled status
 * @param {string} serverId - Discord server ID
 * @param {boolean} enabled - Whether permissions are enabled
 * @returns {boolean} Success or failure
 */
function setPermissionsEnabled(serverId, enabled) {
  try {
    if (!rolePermissions[serverId]) {
      getServerPermissions(serverId);
    }
    
    rolePermissions[serverId].enabled = enabled;
    saveRolePermissions();
    return true;
  } catch (error) {
    logError(`Error setting permissions enabled for ${serverId}:`, error);
    return false;
  }
}

/**
 * Set role permission for a category
 * @param {string} serverId - Discord server ID
 * @param {string} roleId - Discord role ID
 * @param {string} category - Command category
 * @param {number} level - Permission level
 * @returns {boolean} Success or failure
 */
function setRoleCategoryPermission(serverId, roleId, category, level) {
  try {
    if (!rolePermissions[serverId]) {
      getServerPermissions(serverId);
    }
    
    // Initialize roles and categories if needed
    if (!rolePermissions[serverId].roles[roleId]) {
      rolePermissions[serverId].roles[roleId] = {};
    }
    
    if (!rolePermissions[serverId].categories[category]) {
      rolePermissions[serverId].categories[category] = {};
    }
    
    // Set permission
    rolePermissions[serverId].roles[roleId][category] = level;
    rolePermissions[serverId].categories[category][roleId] = level;
    
    saveRolePermissions();
    return true;
  } catch (error) {
    logError(`Error setting role permission for ${serverId}/${roleId}/${category}:`, error);
    return false;
  }
}

/**
 * Get permission level for a role and command
 * @param {string} serverId - Discord server ID
 * @param {Array} userRoleIds - Array of user's role IDs
 * @param {string} commandName - Command name
 * @returns {number} Permission level
 */
function getPermissionLevel(serverId, userRoleIds, commandName) {
  try {
    // If permissions are not enabled, all commands are allowed
    if (!rolePermissions[serverId] || !rolePermissions[serverId].enabled) {
      return PERMISSION_LEVELS.ADMIN;
    }
    
    // Get category for command
    const category = COMMAND_CATEGORY_MAP[commandName] || null;
    
    // If command doesn't have a category, allow it
    if (!category) {
      return PERMISSION_LEVELS.ADMIN;
    }
    
    // Get highest permission level from user's roles
    let highestLevel = PERMISSION_LEVELS.NONE;
    
    for (const roleId of userRoleIds) {
      const rolePermissions = getRolePermissions(serverId, roleId);
      const categoryLevel = rolePermissions[category] || PERMISSION_LEVELS.NONE;
      
      highestLevel = Math.max(highestLevel, categoryLevel);
    }
    
    return highestLevel;
  } catch (error) {
    logError(`Error getting permission level for ${serverId}/${commandName}:`, error);
    return PERMISSION_LEVELS.NONE; // Default to no access on error
  }
}

/**
 * Get permissions for a specific role
 * @param {string} serverId - Discord server ID
 * @param {string} roleId - Discord role ID
 * @returns {Object} Role permissions
 */
function getRolePermissions(serverId, roleId) {
  if (!rolePermissions[serverId] || !rolePermissions[serverId].roles[roleId]) {
    return {};
  }
  
  return rolePermissions[serverId].roles[roleId];
}

/**
 * Check if a user has permission to use a command
 * @param {string} serverId - Discord server ID
 * @param {Array} userRoleIds - Array of user's role IDs
 * @param {string} commandName - Command name
 * @param {number} requiredLevel - Required permission level
 * @returns {boolean} Whether user has permission
 */
function hasPermission(serverId, userRoleIds, commandName, requiredLevel = PERMISSION_LEVELS.USE) {
  const level = getPermissionLevel(serverId, userRoleIds, commandName);
  return level >= requiredLevel;
}

/**
 * Reset all permissions for a server
 * @param {string} serverId - Discord server ID
 * @returns {boolean} Success or failure
 */
function resetServerPermissions(serverId) {
  try {
    rolePermissions[serverId] = {
      enabled: false,
      roles: {},
      categories: {}
    };
    
    saveRolePermissions();
    return true;
  } catch (error) {
    logError(`Error resetting permissions for ${serverId}:`, error);
    return false;
  }
}

/**
 * Get all command categories
 * @returns {Object} Command categories
 */
function getCommandCategories() {
  return COMMAND_CATEGORIES;
}

/**
 * Get category for a command
 * @param {string} commandName - Command name
 * @returns {string|null} Category name or null if not found
 */
function getCommandCategory(commandName) {
  return COMMAND_CATEGORY_MAP[commandName] || null;
}

/**
 * Get all permission levels
 * @returns {Object} Permission levels
 */
function getPermissionLevels() {
  return PERMISSION_LEVELS;
}

/**
 * Get all commands in a category
 * @param {string} category - Category name
 * @returns {Array} Array of command names
 */
function getCategoryCommands(category) {
  return Object.entries(COMMAND_CATEGORY_MAP)
    .filter(([_, cat]) => cat === category)
    .map(([cmd, _]) => cmd);
}

module.exports = {
  COMMAND_CATEGORIES,
  PERMISSION_LEVELS,
  getServerPermissions,
  setPermissionsEnabled,
  setRoleCategoryPermission,
  getPermissionLevel,
  getRolePermissions,
  hasPermission,
  resetServerPermissions,
  getCommandCategories,
  getCommandCategory,
  getPermissionLevels,
  getCategoryCommands
};
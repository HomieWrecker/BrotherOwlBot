/**
 * Role Permissions service for Brother Owl
 * Manages role-based access control for bot commands and features
 */

const fs = require('fs');
const path = require('path');
const { log, error } = require('../utils/logger');
const sqlite3 = require('sqlite3').verbose();

// Database connection
const DB_PATH = path.join(__dirname, '../../data/brother_owl.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    error('Could not connect to database:', err);
  } else {
    log('Connected to the SQLite database');
    initializeDatabase();
  }
});

// Default command categories
const COMMAND_CATEGORIES = {
  ADMINISTRATION: 'administration',
  FACTION_INFO: 'faction_info',
  WELCOME: 'welcome',
  STATS: 'stats',
  API_KEYS: 'api_keys'
};

// Map commands to categories
const COMMAND_CATEGORY_MAP = {
  // Administration commands
  'botpermissions': COMMAND_CATEGORIES.ADMINISTRATION,
  
  // Welcome commands
  'welcome': COMMAND_CATEGORIES.WELCOME,
  
  // Faction info commands
  'factioninfo': COMMAND_CATEGORIES.FACTION_INFO,
  
  // Stats commands
  'stats': COMMAND_CATEGORIES.STATS,
  
  // API key commands
  'apikey': COMMAND_CATEGORIES.API_KEYS
};

// Permission levels
const PERMISSION_LEVELS = {
  NONE: 0,        // No access
  USE: 1,         // Can use basic read-only functionality
  CONTRIBUTE: 2,  // Can contribute data and interact
  MANAGE: 3,      // Can manage and configure
  ADMIN: 4        // Full admin access
};

/**
 * Initialize the database table
 */
function initializeDatabase() {
  db.run(`CREATE TABLE IF NOT EXISTS role_permissions (
    server_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    category TEXT NOT NULL,
    permission_level INTEGER NOT NULL,
    PRIMARY KEY (server_id, role_id, category)
  )`, (err) => {
    if (err) {
      error('Error creating role_permissions table:', err);
    } else {
      log('Role permissions table ready');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS server_permissions_settings (
    server_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0
  )`, (err) => {
    if (err) {
      error('Error creating server_permissions_settings table:', err);
    } else {
      log('Server permissions settings table ready');
    }
  });
}

/**
 * Get permission system status for a server
 * @param {string} serverId - Discord server ID
 * @returns {Promise<boolean>} Whether permissions are enabled
 */
function isPermissionsEnabled(serverId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT enabled FROM server_permissions_settings WHERE server_id = ?', 
      [serverId], (err, row) => {
        if (err) {
          error(`Error checking permissions enabled for ${serverId}:`, err);
          resolve(false); // Default to disabled on error
        } else {
          resolve(row ? row.enabled === 1 : false);
        }
      });
  });
}

/**
 * Set permission system enabled status
 * @param {string} serverId - Discord server ID
 * @param {boolean} enabled - Whether permissions are enabled
 * @returns {Promise<boolean>} Success or failure
 */
function setPermissionsEnabled(serverId, enabled) {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR REPLACE INTO server_permissions_settings (server_id, enabled) VALUES (?, ?)',
      [serverId, enabled ? 1 : 0], (err) => {
        if (err) {
          error(`Error setting permissions enabled for ${serverId}:`, err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
  });
}

/**
 * Set role permission for a category
 * @param {string} serverId - Discord server ID
 * @param {string} roleId - Discord role ID
 * @param {string} category - Command category
 * @param {number} level - Permission level
 * @returns {Promise<boolean>} Success or failure
 */
function setRoleCategoryPermission(serverId, roleId, category, level) {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR REPLACE INTO role_permissions (server_id, role_id, category, permission_level) VALUES (?, ?, ?, ?)',
      [serverId, roleId, category, level], (err) => {
        if (err) {
          error(`Error setting role permission for ${serverId}/${roleId}/${category}:`, err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
  });
}

/**
 * Get permission level for a role and category
 * @param {string} serverId - Discord server ID
 * @param {string} roleId - Discord role ID
 * @param {string} category - Command category
 * @returns {Promise<number>} Permission level
 */
function getRoleCategoryPermission(serverId, roleId, category) {
  return new Promise((resolve, reject) => {
    db.get('SELECT permission_level FROM role_permissions WHERE server_id = ? AND role_id = ? AND category = ?',
      [serverId, roleId, category], (err, row) => {
        if (err) {
          error(`Error getting role permission for ${serverId}/${roleId}/${category}:`, err);
          resolve(PERMISSION_LEVELS.NONE);
        } else {
          resolve(row ? row.permission_level : PERMISSION_LEVELS.NONE);
        }
      });
  });
}

/**
 * Get permission level for a role and command
 * @param {string} serverId - Discord server ID
 * @param {Array} userRoleIds - Array of user's role IDs
 * @param {string} commandName - Command name
 * @returns {Promise<number>} Permission level
 */
async function getPermissionLevel(serverId, userRoleIds, commandName) {
  try {
    // If permissions are not enabled, all commands are allowed
    const enabled = await isPermissionsEnabled(serverId);
    if (!enabled) {
      return PERMISSION_LEVELS.ADMIN;
    }
    
    // Get category for command
    const category = getCommandCategory(commandName);
    
    // If command doesn't have a category, allow it
    if (!category) {
      return PERMISSION_LEVELS.ADMIN;
    }
    
    // Get highest permission level from user's roles
    let highestLevel = PERMISSION_LEVELS.NONE;
    
    for (const roleId of userRoleIds) {
      const categoryLevel = await getRoleCategoryPermission(serverId, roleId, category);
      highestLevel = Math.max(highestLevel, categoryLevel);
    }
    
    return highestLevel;
  } catch (err) {
    error(`Error getting permission level for ${serverId}/${commandName}:`, err);
    return PERMISSION_LEVELS.NONE; // Default to no access on error
  }
}

/**
 * Get all role permissions for a server
 * @param {string} serverId - Discord server ID
 * @returns {Promise<Object>} Server role permissions
 */
function getServerRolePermissions(serverId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT role_id, category, permission_level FROM role_permissions WHERE server_id = ?',
      [serverId], (err, rows) => {
        if (err) {
          error(`Error getting server role permissions for ${serverId}:`, err);
          resolve({});
        } else {
          const permissions = {
            roles: {},
            categories: {}
          };
          
          rows.forEach(row => {
            // Initialize if needed
            if (!permissions.roles[row.role_id]) {
              permissions.roles[row.role_id] = {};
            }
            
            if (!permissions.categories[row.category]) {
              permissions.categories[row.category] = {};
            }
            
            // Set permissions
            permissions.roles[row.role_id][row.category] = row.permission_level;
            permissions.categories[row.category][row.role_id] = row.permission_level;
          });
          
          resolve(permissions);
        }
      });
  });
}

/**
 * Get permissions for a specific role
 * @param {string} serverId - Discord server ID
 * @param {string} roleId - Discord role ID
 * @returns {Promise<Object>} Role permissions
 */
function getRolePermissions(serverId, roleId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT category, permission_level FROM role_permissions WHERE server_id = ? AND role_id = ?',
      [serverId, roleId], (err, rows) => {
        if (err) {
          error(`Error getting role permissions for ${serverId}/${roleId}:`, err);
          resolve({});
        } else {
          const permissions = {};
          rows.forEach(row => {
            permissions[row.category] = row.permission_level;
          });
          resolve(permissions);
        }
      });
  });
}

/**
 * Check if a user has permission to use a command
 * @param {string} serverId - Discord server ID
 * @param {Array} userRoleIds - Array of user's role IDs
 * @param {string} commandName - Command name
 * @param {number} requiredLevel - Required permission level
 * @returns {Promise<boolean>} Whether user has permission
 */
async function hasPermission(serverId, userRoleIds, commandName, requiredLevel = PERMISSION_LEVELS.USE) {
  const level = await getPermissionLevel(serverId, userRoleIds, commandName);
  return level >= requiredLevel;
}

/**
 * Reset all permissions for a server
 * @param {string} serverId - Discord server ID
 * @returns {Promise<boolean>} Success or failure
 */
function resetServerPermissions(serverId) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM role_permissions WHERE server_id = ?', [serverId], (err) => {
      if (err) {
        error(`Error resetting role permissions for ${serverId}:`, err);
        resolve(false);
      } else {
        db.run('DELETE FROM server_permissions_settings WHERE server_id = ?', [serverId], (err) => {
          if (err) {
            error(`Error resetting server permissions settings for ${serverId}:`, err);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      }
    });
  });
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
  isPermissionsEnabled,
  setPermissionsEnabled,
  setRoleCategoryPermission,
  getPermissionLevel,
  getRolePermissions,
  getServerRolePermissions,
  hasPermission,
  resetServerPermissions,
  getCommandCategory,
  getCategoryCommands
};
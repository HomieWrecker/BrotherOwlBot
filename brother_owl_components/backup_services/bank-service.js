/**
 * Banking service for BrotherOwlManager
 * Handles faction bank operations, withdrawal requests, and fulfillment tracking
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');
const { formatNumber } = require('../utils/formatting');
const { getServerConfig, updateServerConfig } = require('./server-config');

// Bank request storage
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BANK_REQUESTS_FILE = path.join(DATA_DIR, 'bank_requests.json');

// Make sure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize bank requests
let bankRequests = {};
try {
  if (fs.existsSync(BANK_REQUESTS_FILE)) {
    bankRequests = JSON.parse(fs.readFileSync(BANK_REQUESTS_FILE, 'utf8'));
  } else {
    fs.writeFileSync(BANK_REQUESTS_FILE, JSON.stringify(bankRequests), 'utf8');
  }
} catch (error) {
  logError('Error initializing bank requests:', error);
}

/**
 * Save bank requests to file
 * @returns {boolean} Success state
 */
function saveBankRequests() {
  try {
    fs.writeFileSync(BANK_REQUESTS_FILE, JSON.stringify(bankRequests, null, 2), 'utf8');
    return true;
  } catch (error) {
    logError('Error saving bank requests:', error);
    return false;
  }
}

/**
 * Get player balance from Torn API
 * @param {string} playerId - Torn ID of the player
 * @param {string} apiKey - Torn API key
 * @returns {Promise<number|null>} Player's faction bank balance or null if not found
 */
async function getPlayerBalance(playerId, apiKey) {
  try {
    const response = await fetch(`https://api.torn.com/user/${playerId}?selections=money&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      logError(`API Error fetching player balance: ${data.error.error}`);
      return null;
    }
    
    // Return faction bank balance, if available
    if (data.faction_bank_balance !== undefined) {
      return data.faction_bank_balance;
    }
    
    return null;
  } catch (error) {
    logError('Error fetching player balance:', error);
    return null;
  }
}

/**
 * Create a new bank withdrawal request
 * @param {string} serverId - Discord server ID
 * @param {string} requestId - Unique ID for the request
 * @param {string} userId - Discord user ID of the requester
 * @param {string} tornId - Torn ID of the requester
 * @param {string} tornName - Torn name of the requester
 * @param {number} amount - Amount to withdraw
 * @returns {boolean} Success state
 */
function createBankRequest(serverId, requestId, userId, tornId, tornName, amount) {
  try {
    // Initialize server requests if they don't exist
    if (!bankRequests[serverId]) {
      bankRequests[serverId] = {};
    }
    
    // Create the request
    bankRequests[serverId][requestId] = {
      userId,
      tornId,
      tornName,
      amount,
      requestTime: Date.now(),
      status: 'pending', // pending, fulfilled, cancelled
      fulfilledBy: null,
      fulfillTime: null,
      notified: false
    };
    
    saveBankRequests();
    log(`Created bank request ${requestId} for ${tornName} [${tornId}]: $${formatNumber(amount)}`);
    return true;
  } catch (error) {
    logError(`Error creating bank request for ${tornId}:`, error);
    return false;
  }
}

/**
 * Update bank request status
 * @param {string} serverId - Discord server ID
 * @param {string} requestId - Unique ID for the request
 * @param {string} status - New status (pending, fulfilled, cancelled)
 * @param {string} bankerId - Discord user ID of the banker who fulfilled the request
 * @returns {boolean} Success state
 */
function updateBankRequest(serverId, requestId, status, bankerId = null) {
  try {
    // Verify the request exists
    if (!bankRequests[serverId] || !bankRequests[serverId][requestId]) {
      return false;
    }
    
    // Update the request
    bankRequests[serverId][requestId].status = status;
    
    if (status === 'fulfilled' && bankerId) {
      bankRequests[serverId][requestId].fulfilledBy = bankerId;
      bankRequests[serverId][requestId].fulfillTime = Date.now();
    }
    
    saveBankRequests();
    log(`Updated bank request ${requestId} status to ${status}`);
    return true;
  } catch (error) {
    logError(`Error updating bank request ${requestId}:`, error);
    return false;
  }
}

/**
 * Mark bank request as notified
 * @param {string} serverId - Discord server ID
 * @param {string} requestId - Unique ID for the request
 * @returns {boolean} Success state
 */
function markBankRequestNotified(serverId, requestId) {
  try {
    // Verify the request exists
    if (!bankRequests[serverId] || !bankRequests[serverId][requestId]) {
      return false;
    }
    
    // Mark as notified
    bankRequests[serverId][requestId].notified = true;
    
    saveBankRequests();
    return true;
  } catch (error) {
    logError(`Error marking bank request ${requestId} as notified:`, error);
    return false;
  }
}

/**
 * Get bank request by ID
 * @param {string} serverId - Discord server ID
 * @param {string} requestId - Unique ID for the request
 * @returns {Object|null} Bank request or null if not found
 */
function getBankRequest(serverId, requestId) {
  try {
    if (!bankRequests[serverId] || !bankRequests[serverId][requestId]) {
      return null;
    }
    
    return bankRequests[serverId][requestId];
  } catch (error) {
    logError(`Error getting bank request ${requestId}:`, error);
    return null;
  }
}

/**
 * Get all pending bank requests for a server
 * @param {string} serverId - Discord server ID
 * @returns {Array} Array of pending bank requests
 */
function getPendingBankRequests(serverId) {
  try {
    if (!bankRequests[serverId]) {
      return [];
    }
    
    return Object.entries(bankRequests[serverId])
      .filter(([, request]) => request.status === 'pending')
      .map(([id, request]) => ({ id, ...request }));
  } catch (error) {
    logError(`Error getting pending bank requests for server ${serverId}:`, error);
    return [];
  }
}

/**
 * Get fulfilled but not notified bank requests for a user
 * @param {string} serverId - Discord server ID
 * @param {string} userId - Discord user ID
 * @returns {Array} Array of fulfilled but not notified bank requests
 */
function getFulfilledNotNotifiedRequests(serverId, userId) {
  try {
    if (!bankRequests[serverId]) {
      return [];
    }
    
    return Object.entries(bankRequests[serverId])
      .filter(([, request]) => 
        request.userId === userId && 
        request.status === 'fulfilled' && 
        !request.notified
      )
      .map(([id, request]) => ({ id, ...request }));
  } catch (error) {
    logError(`Error getting fulfilled not notified requests for user ${userId}:`, error);
    return [];
  }
}

/**
 * Set bank configuration for a server
 * @param {string} serverId - Discord server ID
 * @param {Object} config - Bank configuration
 * @returns {boolean} Success state
 */
function setBankConfig(serverId, config) {
  try {
    return updateServerConfig(serverId, 'bankConfig', config);
  } catch (error) {
    logError(`Error setting bank config for server ${serverId}:`, error);
    return false;
  }
}

/**
 * Generate Torn bank URL with prefilled data
 * @param {string} tornId - Torn ID of the recipient
 * @param {number} amount - Amount to give
 * @returns {string} URL to the Torn faction bank with prefilled data
 */
function generateBankURL(tornId, amount) {
  // Encode the parameters properly
  const url = `https://www.torn.com/factions.php?step=your#/tab=bank`;
  // Note: Torn doesn't support prefilled values in this URL, but we're providing the direct link to the faction bank
  // The banker will have to manually enter the values, but the idea is that we've given them the information
  return url;
}

/**
 * Clean up old bank requests (older than 7 days)
 */
function cleanupOldRequests() {
  try {
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    let changed = false;
    
    // Check each server
    for (const serverId in bankRequests) {
      for (const requestId in bankRequests[serverId]) {
        const request = bankRequests[serverId][requestId];
        
        // If request is older than 7 days and either fulfilled or cancelled, remove it
        if ((request.status === 'fulfilled' || request.status === 'cancelled') && 
            request.requestTime < sevenDaysAgo) {
          delete bankRequests[serverId][requestId];
          changed = true;
        }
      }
      
      // If no requests left for this server, delete the server entry
      if (Object.keys(bankRequests[serverId]).length === 0) {
        delete bankRequests[serverId];
        changed = true;
      }
    }
    
    if (changed) {
      saveBankRequests();
      log('Cleaned up old bank requests');
    }
  } catch (error) {
    logError('Error cleaning up old bank requests:', error);
  }
}

// Run cleanup every day
setInterval(cleanupOldRequests, 24 * 60 * 60 * 1000);

module.exports = {
  getPlayerBalance,
  createBankRequest,
  updateBankRequest,
  markBankRequestNotified,
  getBankRequest,
  getPendingBankRequests,
  getFulfilledNotNotifiedRequests,
  setBankConfig,
  generateBankURL
};
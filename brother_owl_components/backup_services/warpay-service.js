/**
 * War Pay Service for BrotherOwlManager
 * Tracks and calculates member contributions and payments for war efforts
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');
const { formatNumber } = require('../utils/formatting');
const https = require('https');

// Data file path
const WARPAY_DATA_FILE = path.join(__dirname, '../../data/warpay_data.json');

// Initialize data structure with failsafe defaults
let warPayData = {
  wars: {},   // By warId: tracks contributions for each specific war
  ongoing: {} // Current/active tracking without a specific war ID
};

/**
 * Load war pay data from file
 */
function loadWarPayData() {
  try {
    if (fs.existsSync(WARPAY_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(WARPAY_DATA_FILE, 'utf8'));
      warPayData = data;
      log('War pay data loaded');
    } else {
      saveWarPayData(); // Create the file if it doesn't exist
      log('New war pay data file created');
    }
  } catch (error) {
    logError('Error loading war pay data:', error);
    // Continue with default empty data structure
  }
}

/**
 * Save war pay data to file
 */
function saveWarPayData() {
  try {
    fs.writeFileSync(WARPAY_DATA_FILE, JSON.stringify(warPayData, null, 2));
  } catch (error) {
    logError('Error saving war pay data:', error);
  }
}

/**
 * Fetch attack data for a faction from Torn API
 * @param {string} apiKey - Torn API key
 * @param {string} factionId - Optional specific faction ID
 * @param {string} warId - Optional war ID for specific war contributions
 * @param {boolean} trackEnemyOnly - Whether to only track attacks on enemy faction
 * @returns {Promise<Object>} Updated war pay data
 */
async function fetchWarContributions(apiKey, factionId = null, warId = null, trackEnemyOnly = true) {
  return new Promise((resolve, reject) => {
    try {
      // If no faction ID is provided, get it from the API key
      const endpoint = factionId 
        ? `/faction/${factionId}?selections=basic,attacks&key=${apiKey}`
        : `/user/?selections=basic,faction&key=${apiKey}`;
      
      const options = {
        hostname: 'api.torn.com',
        path: endpoint,
        method: 'GET'
      };
      
      const req = https.request(options, res => {
        let data = '';
        
        res.on('data', chunk => {
          data += chunk;
        });
        
        res.on('end', async () => {
          try {
            const response = JSON.parse(data);
            
            if (response.error) {
              reject(new Error(`Torn API error: ${response.error.error}`));
              return;
            }
            
            // If no faction ID was provided, get it from the response
            const actualFactionId = factionId || (response.faction ? response.faction.faction_id : null);
            
            if (!actualFactionId) {
              reject(new Error('No faction ID found'));
              return;
            }
            
            // Now fetch the faction data if we didn't already get it
            if (!factionId) {
              const factionData = await fetchFactionData(apiKey, actualFactionId);
              await processWarData(factionData, actualFactionId, warId, trackEnemyOnly);
              resolve(warPayData);
            } else {
              await processWarData(response, actualFactionId, warId, trackEnemyOnly);
              resolve(warPayData);
            }
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', error => {
        reject(error);
      });
      
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Fetch faction data from Torn API
 * @param {string} apiKey - Torn API key
 * @param {string} factionId - Faction ID
 * @returns {Promise<Object>} Faction data
 */
async function fetchFactionData(apiKey, factionId) {
  return new Promise((resolve, reject) => {
    try {
      const options = {
        hostname: 'api.torn.com',
        path: `/faction/${factionId}?selections=basic,attacks&key=${apiKey}`,
        method: 'GET'
      };
      
      const req = https.request(options, res => {
        let data = '';
        
        res.on('data', chunk => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (response.error) {
              reject(new Error(`Torn API error: ${response.error.error}`));
              return;
            }
            
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', error => {
        reject(error);
      });
      
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Fetch war information to get enemy faction ID
 * @param {string} apiKey - Torn API key
 * @param {string} factionId - Faction ID
 * @param {string} warId - War ID
 * @returns {Promise<string|null>} Enemy faction ID or null if not found
 */
async function fetchEnemyFactionId(apiKey, factionId, warId) {
  return new Promise((resolve, reject) => {
    try {
      if (!warId) {
        resolve(null);
        return;
      }
      
      const options = {
        hostname: 'api.torn.com',
        path: `/faction/${factionId}?selections=wars&key=${apiKey}`,
        method: 'GET'
      };
      
      const req = https.request(options, res => {
        let data = '';
        
        res.on('data', chunk => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (response.error) {
              reject(new Error(`Torn API error: ${response.error.error}`));
              return;
            }
            
            // Find the war by ID
            if (response.wars && response.wars[warId]) {
              const war = response.wars[warId];
              // Determine which faction is the enemy
              const enemyFactionId = war.faction1 === parseInt(factionId) ? war.faction2 : war.faction1;
              resolve(enemyFactionId.toString());
            } else {
              resolve(null);
            }
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', error => {
        reject(error);
      });
      
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Process faction data to calculate war contributions
 * @param {Object} factionData - Faction data from Torn API
 * @param {string} factionId - Faction ID
 * @param {string} warId - Optional war ID for specific war contributions
 * @param {boolean} trackEnemyOnly - Whether to only track attacks on enemy faction
 */
async function processWarData(factionData, factionId, warId, trackEnemyOnly) {
  try {
    // Get the enemy faction ID if this is for a specific war
    let enemyFactionId = null;
    if (warId && trackEnemyOnly) {
      try {
        enemyFactionId = await fetchEnemyFactionId(apiKey, factionId, warId);
      } catch (error) {
        logError('Error fetching enemy faction ID:', error);
        // Continue without enemy faction filtering
      }
    }
    
    // Determine which data store to use (war-specific or ongoing)
    const dataStore = warId ? warPayData.wars : warPayData.ongoing;
    
    // Initialize data structure for this war or ongoing tracking if it doesn't exist
    const trackingId = warId || 'current';
    if (!dataStore[trackingId]) {
      dataStore[trackingId] = {
        startTime: Date.now(),
        lastUpdate: Date.now(),
        memberContributions: {},
        enemyHits: 0,
        otherHits: 0,
        totalHits: 0
      };
    }
    
    const tracking = dataStore[trackingId];
    tracking.lastUpdate = Date.now();
    
    // Process attacks
    if (factionData.attacks) {
      Object.entries(factionData.attacks).forEach(([attackId, attack]) => {
        // Skip if this attack has already been processed
        if (tracking.processedAttacks && tracking.processedAttacks.includes(attackId)) {
          return;
        }
        
        // Skip if attack timestamp is before start time
        if (attack.timestamp * 1000 < tracking.startTime) {
          return;
        }
        
        // Skip if attacker is not from our faction
        if (attack.attacker_faction !== parseInt(factionId)) {
          return;
        }
        
        // Determine if this is an enemy hit
        const isEnemyHit = enemyFactionId && attack.defender_faction === parseInt(enemyFactionId);
        
        // Skip if we're only tracking enemy hits and this is not one
        if (trackEnemyOnly && !isEnemyHit && enemyFactionId) {
          return;
        }
        
        // Skip unsuccessful attacks
        if (attack.result === 'Lost') {
          return;
        }
        
        // Get member ID
        const memberId = attack.attacker_id.toString();
        
        // Initialize member if not exists
        if (!tracking.memberContributions[memberId]) {
          tracking.memberContributions[memberId] = {
            name: attack.attacker_name,
            enemyHits: 0,
            otherHits: 0,
            totalHits: 0,
            lastAttack: 0
          };
        }
        
        // Update member contributions
        const member = tracking.memberContributions[memberId];
        member.name = attack.attacker_name;
        
        if (isEnemyHit) {
          member.enemyHits++;
          tracking.enemyHits++;
        } else {
          member.otherHits++;
          tracking.otherHits++;
        }
        
        member.totalHits++;
        tracking.totalHits++;
        
        // Update last attack timestamp
        member.lastAttack = Math.max(member.lastAttack, attack.timestamp);
        
        // Mark attack as processed
        if (!tracking.processedAttacks) {
          tracking.processedAttacks = [];
        }
        tracking.processedAttacks.push(attackId);
      });
    }
    
    // Save updated data
    saveWarPayData();
  } catch (error) {
    logError('Error processing war data:', error);
    throw error;
  }
}

/**
 * Calculate payment distribution based on contributions
 * @param {string} warId - War ID or 'current' for ongoing tracking
 * @param {number} totalAmount - Total amount to distribute
 * @param {number} percentageToDistribute - Percentage of the total to distribute (0-100)
 * @param {string} contributionType - Type of contribution to consider ('enemy', 'other', 'both')
 * @returns {Object} Payment distribution data
 */
function calculatePayments(warId, totalAmount, percentageToDistribute, contributionType = 'both') {
  try {
    // Determine which data store to use
    const isWar = warId !== 'current';
    const dataStore = isWar ? warPayData.wars : warPayData.ongoing;
    
    // Check if we have data for this tracking
    if (!dataStore[warId]) {
      throw new Error(`No data found for ${isWar ? 'war' : 'tracking'} ID: ${warId}`);
    }
    
    const tracking = dataStore[warId];
    
    // Calculate the amount to distribute
    const distributionAmount = totalAmount * (percentageToDistribute / 100);
    
    // Get the total contribution count based on the selected type
    let totalContribution = 0;
    switch (contributionType) {
      case 'enemy':
        totalContribution = tracking.enemyHits;
        break;
      case 'other':
        totalContribution = tracking.otherHits;
        break;
      case 'both':
      default:
        totalContribution = tracking.totalHits;
        break;
    }
    
    // Cannot distribute if there are no contributions
    if (totalContribution === 0) {
      throw new Error('No contributions found to distribute payment');
    }
    
    // Calculate payment per contribution
    const paymentPerContribution = distributionAmount / totalContribution;
    
    // Calculate payments for each member
    const payments = {
      totalAmount,
      distributionAmount,
      contributionType,
      totalContribution,
      memberPayments: {},
      startTime: tracking.startTime,
      lastUpdate: tracking.lastUpdate
    };
    
    Object.entries(tracking.memberContributions).forEach(([memberId, contribution]) => {
      // Get relevant contribution count
      let memberContribution = 0;
      switch (contributionType) {
        case 'enemy':
          memberContribution = contribution.enemyHits;
          break;
        case 'other':
          memberContribution = contribution.otherHits;
          break;
        case 'both':
        default:
          memberContribution = contribution.totalHits;
          break;
      }
      
      // Calculate member's payment
      const payment = memberContribution * paymentPerContribution;
      
      // Add to payments if non-zero
      if (memberContribution > 0) {
        payments.memberPayments[memberId] = {
          name: contribution.name,
          contribution: memberContribution,
          contributionPercentage: (memberContribution / totalContribution) * 100,
          payment
        };
      }
    });
    
    return payments;
  } catch (error) {
    logError('Error calculating payments:', error);
    throw error;
  }
}

/**
 * Start a new war pay tracking session
 * @param {string} warId - War ID or null for ongoing tracking
 * @returns {Object} New tracking session data
 */
function startNewTracking(warId = null) {
  try {
    const trackingId = warId || 'current';
    const dataStore = warId ? warPayData.wars : warPayData.ongoing;
    
    // Create a new tracking session
    dataStore[trackingId] = {
      startTime: Date.now(),
      lastUpdate: Date.now(),
      memberContributions: {},
      enemyHits: 0,
      otherHits: 0,
      totalHits: 0,
      processedAttacks: []
    };
    
    // Save updated data
    saveWarPayData();
    
    return dataStore[trackingId];
  } catch (error) {
    logError('Error starting new tracking:', error);
    throw error;
  }
}

/**
 * Reset an existing tracking session
 * @param {string} warId - War ID or 'current' for ongoing tracking
 * @returns {Object} Reset tracking session data
 */
function resetTracking(warId) {
  try {
    return startNewTracking(warId === 'current' ? null : warId);
  } catch (error) {
    logError('Error resetting tracking:', error);
    throw error;
  }
}

/**
 * Get a list of all tracking sessions
 * @returns {Object} List of war and ongoing tracking sessions
 */
function getTrackingSessions() {
  try {
    const sessions = {
      wars: Object.keys(warPayData.wars).map(warId => ({
        id: warId,
        startTime: warPayData.wars[warId].startTime,
        lastUpdate: warPayData.wars[warId].lastUpdate,
        totalHits: warPayData.wars[warId].totalHits
      })),
      ongoing: warPayData.ongoing.current ? {
        startTime: warPayData.ongoing.current.startTime,
        lastUpdate: warPayData.ongoing.current.lastUpdate,
        totalHits: warPayData.ongoing.current.totalHits
      } : null
    };
    
    return sessions;
  } catch (error) {
    logError('Error getting tracking sessions:', error);
    throw error;
  }
}

/**
 * Get details for a specific tracking session
 * @param {string} warId - War ID or 'current' for ongoing tracking
 * @returns {Object} Tracking session details
 */
function getTrackingDetails(warId) {
  try {
    const isWar = warId !== 'current';
    const dataStore = isWar ? warPayData.wars : warPayData.ongoing;
    
    if (!dataStore[warId]) {
      throw new Error(`No data found for ${isWar ? 'war' : 'tracking'} ID: ${warId}`);
    }
    
    return dataStore[warId];
  } catch (error) {
    logError('Error getting tracking details:', error);
    throw error;
  }
}

// Initialize data on load
loadWarPayData();

// Export functions
module.exports = {
  fetchWarContributions,
  calculatePayments,
  startNewTracking,
  resetTracking,
  getTrackingSessions,
  getTrackingDetails
};
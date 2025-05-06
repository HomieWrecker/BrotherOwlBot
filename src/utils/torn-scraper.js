/**
 * Torn Scraper Utility for BrotherOwlManager
 * Provides methods to gather additional data through puppeteer and trafilatura
 * Ensures all methods comply with Torn's rules
 */

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const { log, logError } = require('./logger');
const path = require('path');

/**
 * Get battle stats for a player using available methods
 * @param {string} playerId - Torn player ID
 * @param {string} apiKey - API key to use
 * @returns {Promise<Object>} Battle stats and additional info
 */
async function getPlayerBattleStats(playerId, apiKey) {
  try {
    // First try to get data from Torn API
    const apiData = await fetchPlayerApiData(playerId, apiKey);
    
    // Check if we received an error object
    if (apiData.error) {
      // Just pass it through
      return apiData;
    }
    
    // Combine with additional data sources
    const enhancedData = {
      ...apiData,
      // Add additional calculated fields
      calculatedStats: {
        totalBattleStats: calculateTotalBattleStats(apiData),
        estimatedActivity: estimatePlayerActivity(apiData)
        // No win probability - just focusing on stats
      }
    };
    
    return enhancedData;
  } catch (error) {
    logError(`Error getting battle stats for player ${playerId}:`, error);
    return {
      error: {
        code: 0,
        error: error.message || "Unknown error occurred"
      }
    };
  }
}

/**
 * Fetch player data from Torn API
 * @param {string} playerId - Torn player ID
 * @param {string} apiKey - API key with proper permissions
 * @returns {Promise<Object>} Player data
 */
async function fetchPlayerApiData(playerId, apiKey) {
  try {
    const response = await fetch(`https://api.torn.com/user/${playerId}?selections=battlestats,profile&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      // Return error object instead of throwing to allow better error handling upstream
      logError(`API error for player ${playerId}: ${data.error.code} - ${data.error.error}`);
      return {
        error: {
          code: data.error.code,
          error: data.error.error
        }
      };
    }
    
    return data;
  } catch (error) {
    logError(`Error fetching player data from API:`, error);
    // For network errors, etc. create a generic error object
    return {
      error: {
        code: 0,
        error: error.message || "Network error occurred"
      }
    };
  }
}

/**
 * Use Python trafilatura to extract content from a web page
 * @param {string} url - URL to scrape
 * @returns {Promise<string>} Extracted text content
 */
async function extractWebContent(url) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [
      '-c',
      `import trafilatura; downloaded = trafilatura.fetch_url("${url}"); text = trafilatura.extract(downloaded); print(text)`
    ]);
    
    let dataString = '';
    
    pythonProcess.stdout.on('data', (data) => {
      dataString += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      logError(`Python error: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}`));
      } else {
        resolve(dataString.trim());
      }
    });
  });
}

/**
 * Calculate total battle stats from API data
 * @param {Object} apiData - Player API data
 * @returns {number} Total battle stats
 */
function calculateTotalBattleStats(apiData) {
  if (!apiData) {
    return 0;
  }
  
  // Handle both regular apiData and battlestats structure
  let strength = apiData.strength;
  let defense = apiData.defense;
  let speed = apiData.speed;
  let dexterity = apiData.dexterity;
  
  // Check if stats are in a battlestats sub-object
  if (apiData.battlestats) {
    strength = apiData.battlestats.strength;
    defense = apiData.battlestats.defense;
    speed = apiData.battlestats.speed;
    dexterity = apiData.battlestats.dexterity;
  }
  
  if (!strength || !defense || !speed || !dexterity) {
    return 0;
  }
  
  return strength + defense + speed + dexterity;
}

/**
 * Estimate player activity based on API data
 * @param {Object} apiData - Player API data
 * @returns {string} Estimated activity level
 */
function estimatePlayerActivity(apiData) {
  if (!apiData) {
    return 'Unknown';
  }
  
  // Handle different possible API response structures
  let lastAction = apiData.last_action;
  
  // Try to extract the last_action from different possible locations
  if (!lastAction && apiData.profile && apiData.profile.last_action) {
    lastAction = apiData.profile.last_action;
  }
  
  if (!lastAction || !lastAction.timestamp) {
    // Try to interpret the last_action if it's a string like "X minutes/hours/days ago"
    if (typeof lastAction === 'string' || (lastAction && typeof lastAction.status === 'string')) {
      const statusText = typeof lastAction === 'string' ? lastAction : lastAction.status;
      
      if (statusText.includes('minute')) {
        return 'Very Active';
      } else if (statusText.includes('hour')) {
        return 'Active';
      } else if (statusText.includes('day') && parseInt(statusText) <= 1) {
        return 'Daily';
      } else if (statusText.includes('day') && parseInt(statusText) <= 3) {
        return 'Semi-Active';
      } else {
        return 'Inactive';
      }
    }
    
    return 'Unknown';
  }
  
  const lastActionTimestamp = new Date(lastAction.timestamp * 1000);
  const now = new Date();
  const hoursSinceLastAction = (now - lastActionTimestamp) / (1000 * 60 * 60);
  
  if (hoursSinceLastAction < 1) {
    return 'Very Active';
  } else if (hoursSinceLastAction < 8) {
    return 'Active';
  } else if (hoursSinceLastAction < 24) {
    return 'Daily';
  } else if (hoursSinceLastAction < 72) {
    return 'Semi-Active';
  } else {
    return 'Inactive';
  }
}

/**
 * Calculate win probability against an opponent
 * @param {Object} playerStats - Player's battle stats
 * @param {Object} opponentStats - Opponent's battle stats 
 * @returns {number} Win probability (0-1)
 */
function calculateWinProbability(playerStats, opponentStats) {
  if (!playerStats || !opponentStats) {
    return 0.5; // Default to 50% if we don't have enough data
  }
  
  const playerTotal = calculateTotalBattleStats(playerStats);
  const opponentTotal = calculateTotalBattleStats(opponentStats);
  
  if (playerTotal === 0 || opponentTotal === 0) {
    return 0.5;
  }
  
  // Simple probability model based on relative strength
  // This is just a basic example and could be made more sophisticated
  const ratio = playerTotal / opponentTotal;
  const probability = ratio / (1 + ratio);
  
  return Math.min(Math.max(probability, 0), 1); // Ensure between 0 and 1
}

/**
 * Calculate fair fight bonus based on relative battle stats
 * @param {Object} playerStats - Player's battle stats
 * @param {Object} opponentStats - Opponent's battle stats
 * @returns {number} Fair fight multiplier (0.00-3.00)
 */
function calculateFairFightBonus(playerStats, opponentStats) {
  if (!playerStats || !opponentStats) {
    return 1.0;
  }
  
  const playerTotal = calculateTotalBattleStats(playerStats);
  const opponentTotal = calculateTotalBattleStats(opponentStats);
  
  if (playerTotal === 0 || opponentTotal === 0) {
    return 1.0;
  }
  
  // Simplified fair fight calculation
  // Actual Torn calculation is not public, this is an approximation
  if (playerTotal > opponentTotal) {
    const ratio = opponentTotal / playerTotal;
    // Diminishing returns curve
    return Math.max(0.25, Math.min(3.0, Math.pow(ratio, 0.5) * 3));
  } else {
    return Math.min(3.0, Math.sqrt(opponentTotal / playerTotal) * 0.5 + 0.75);
  }
}

/**
 * Get faction members data with battle stats
 * @param {string} factionId - Faction ID to gather data for
 * @param {string} apiKey - API key with proper permissions
 * @returns {Promise<Array>} Sorted array of faction members with stats
 */
async function getFactionMembersStats(factionId, apiKey) {
  try {
    // Fetch faction data including members
    const response = await fetch(`https://api.torn.com/faction/${factionId}?selections=basic&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      // Return error object instead of throwing
      return {
        error: {
          code: data.error.code,
          error: data.error.error
        }
      };
    }
    
    // Check if we have members
    if (!data.members || Object.keys(data.members).length === 0) {
      return {
        error: {
          code: 0,
          error: "No faction members found"
        }
      };
    }
    
    // Extract members and create enhanced data array
    const members = [];
    const memberPromises = [];
    
    for (const [memberId, memberData] of Object.entries(data.members)) {
      // Queue up member data fetches (with rate limiting in mind)
      memberPromises.push(
        // Artificial delay to avoid hitting rate limits
        new Promise(resolve => setTimeout(resolve, 200 * memberPromises.length))
          .then(() => getPlayerBattleStats(memberId, apiKey))
          .then(stats => {
            if (stats && !stats.error) {
              members.push({
                id: memberId,
                name: memberData.name,
                level: memberData.level,
                stats: stats
              });
            }
          })
          .catch(error => {
            logError(`Error fetching stats for member ${memberId}:`, error);
          })
      );
    }
    
    // Wait for all member data to be fetched
    await Promise.all(memberPromises);
    
    // Sort by total battle stats (highest first)
    members.sort((a, b) => {
      const aTotal = a.stats?.calculatedStats?.totalBattleStats || 0;
      const bTotal = b.stats?.calculatedStats?.totalBattleStats || 0;
      return bTotal - aTotal;
    });
    
    return members;
  } catch (error) {
    logError(`Error getting faction members stats:`, error);
    return {
      error: {
        code: 0,
        error: error.message || "Unknown error occurred"
      }
    };
  }
}

/**
 * Find potential targets based on user's battle stats
 * @param {Object} userStats - User's battle stats
 * @param {string} apiKey - API key with proper permissions
 * @param {number} maxResults - Maximum number of targets to return
 * @returns {Promise<Array>} Sorted array of potential targets
 */
async function findPotentialTargets(userStats, apiKey, maxResults = 10) {
  try {
    // This would ideally query a database of potential targets
    // For this example, we'll use the API to find random players
    // In a real implementation, you would need a more sophisticated target selection method
    
    const targetList = [];
    const userTotal = calculateTotalBattleStats(userStats);
    
    // In a real implementation, you would have a database or other source of potential targets
    // This is just a placeholder approach using random player IDs
    // NOT recommended for production use - this is just for illustration
    for (let i = 0; i < 20; i++) {
      // Generate a random player ID between 1 and 2,000,000
      // NOTE: This is NOT a good way to find targets and is just for demonstration
      const randomId = Math.floor(Math.random() * 2000000) + 1;
      
      try {
        const targetStats = await getPlayerBattleStats(randomId, apiKey);
        
        if (targetStats) {
          const targetTotal = calculateTotalBattleStats(targetStats);
          const winProbability = calculateWinProbability(userStats, targetStats);
          const fairFightBonus = calculateFairFightBonus(userStats, targetStats);
          
          // Only include targets with a reasonable chance of winning
          // and that have an acceptable stat range compared to the user
          if (winProbability > 0.4 && targetTotal > 0) {
            targetList.push({
              id: randomId,
              name: targetStats.name || `Player ${randomId}`,
              level: targetStats.level || 0,
              stats: targetStats,
              activity: estimatePlayerActivity(targetStats),
              fairFightBonus,
              winProbability,
              score: fairFightBonus * winProbability // Combined score for ranking
            });
          }
        }
      } catch (error) {
        // Skip this target and continue
        continue;
      }
    }
    
    // Sort by score (highest first)
    targetList.sort((a, b) => b.score - a.score);
    
    // Return the top results
    return targetList.slice(0, maxResults);
  } catch (error) {
    logError(`Error finding potential targets:`, error);
    return [];
  }
}

module.exports = {
  getPlayerBattleStats,
  getFactionMembersStats,
  findPotentialTargets,
  calculateTotalBattleStats,
  estimatePlayerActivity,
  calculateWinProbability,
  calculateFairFightBonus,
  extractWebContent
};
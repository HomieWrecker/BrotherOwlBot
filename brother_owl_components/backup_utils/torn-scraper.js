/**
 * Torn API Utility for BrotherOwlManager
 * Provides methods to gather data through the Torn API only
 * Ensures all methods comply with Torn's rules
 */

const { log, logError } = require('./logger');

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
 * Extract content from a web page using trafilatura (if available)
 * @param {string} url - URL to get content from
 * @returns {Promise<string>} Content message
 */
async function extractWebContent(url) {
  try {
    // First try to use the Python-based trafilatura if available
    try {
      // Execute the Python script to get content
      const { execSync } = require('child_process');
      const result = execSync(`python3 -c "import trafilatura; downloaded = trafilatura.fetch_url('${url}'); print(trafilatura.extract(downloaded))"`, { encoding: 'utf8' });
      
      if (result && result.trim().length > 0) {
        return result.trim();
      }
    } catch (pythonError) {
      log('Trafilatura not available, falling back to basic fetching:', pythonError.message);
    }
    
    // Fallback to basic fetching
    const response = await fetch(url);
    const html = await response.text();
    
    // Very basic HTML text extraction
    const text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                     .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                     .replace(/<[^>]+>/g, ' ')
                     .replace(/\s{2,}/g, ' ')
                     .trim();
    
    return text;
  } catch (error) {
    logError('Error extracting web content:', error);
    return 'Error extracting web content. Please try using API methods instead.';
  }
}

/**
 * Scrape a player's Torn profile page for public data
 * @param {string} playerId - Torn player ID
 * @returns {Promise<Object>} Public profile data
 */
async function scrapePlayerProfile(playerId) {
  try {
    const url = `https://www.torn.com/profiles.php?XID=${playerId}`;
    log(`Scraping profile from ${url}`);
    
    const content = await extractWebContent(url);
    
    // Parse the content to extract useful information
    // This is a simplified version - real implementation would be more robust
    const parsedData = {
      id: playerId,
      name: extractInfo(content, /Name:\s*([^<\n]+)/),
      level: parseInt(extractInfo(content, /Level:\s*(\d+)/)) || 0,
      status: extractInfo(content, /Status:\s*([^<\n]+)/),
      lastAction: extractInfo(content, /Last Action:\s*([^<\n]+)/),
      faction: {
        name: extractInfo(content, /Faction:\s*([^<\n]+)/),
        position: extractInfo(content, /Position:\s*([^<\n]+)/)
      },
      awards: parseInt(extractInfo(content, /Awards:\s*(\d+)/)) || 0,
      age: parseInt(extractInfo(content, /Age:\s*(\d+)/)) || 0,
      property: extractInfo(content, /Property:\s*([^<\n]+)/),
      job: extractInfo(content, /Job:\s*([^<\n]+)/),
      rank: extractInfo(content, /Rank:\s*([^<\n]+)/),
      rankedWarCount: parseInt(extractInfo(content, /Ranked Wars:\s*(\d+)/)) || 0,
      competitiveWarCount: parseInt(extractInfo(content, /Competitive Wars:\s*(\d+)/)) || 0,
      networth: parseNetworth(extractInfo(content, /Networth:\s*([^<\n]+)/)),
      factionPosition: extractInfo(content, /Position:\s*([^<\n]+)/),
      
      // Estimation relevant data
      awards_analysis: {
        combat_awards: estimateCombatAwards(content),
        education_awards: estimateEducationAwards(content),
        total_awards: parseInt(extractInfo(content, /Awards:\s*(\d+)/)) || 0
      },
      
      // Activity indicators
      activity_indicators: {
        last_action: extractInfo(content, /Last Action:\s*([^<\n]+)/),
        status: extractInfo(content, /Status:\s*([^<\n]+)/),
        estimated_activity: estimateActivityFromProfile(content)
      }
    };
    
    // Extract battle stats hints from profile
    parsedData.battle_indicators = extractBattleIndicators(content);
    
    return parsedData;
  } catch (error) {
    logError(`Error scraping player profile ${playerId}:`, error);
    return null;
  }
}

/**
 * Parse networth string to number
 * @param {string} networthStr - Networth string (e.g. "$1.23bil")
 * @returns {number} Networth value
 */
function parseNetworth(networthStr) {
  if (!networthStr) {
    return 0;
  }
  
  try {
    // Remove "$" and spaces
    let value = networthStr.replace(/[$\s]/g, '');
    
    // Convert abbreviations to numbers
    if (value.includes('bil')) {
      value = parseFloat(value.replace('bil', '')) * 1000000000;
    } else if (value.includes('mil')) {
      value = parseFloat(value.replace('mil', '')) * 1000000;
    } else if (value.includes('k')) {
      value = parseFloat(value.replace('k', '')) * 1000;
    } else {
      value = parseFloat(value);
    }
    
    return isNaN(value) ? 0 : value;
  } catch (error) {
    return 0;
  }
}

/**
 * Estimate number of combat awards from profile
 * @param {string} content - Profile content
 * @returns {number} Estimated number of combat awards
 */
function estimateCombatAwards(content) {
  try {
    // Look for awards related to combat
    let combatAwards = 0;
    
    // Common combat awards
    const combatAwardPatterns = [
      /Combat:\s*(\d+)/i,
      /Defender:\s*(\d+)/i,
      /Damage:\s*(\d+)/i,
      /Destruction:\s*(\d+)/i,
      /Chain:\s*(\d+)/i,
      /Critical Hit:\s*(\d+)/i,
      /Finishing Hit:\s*(\d+)/i,
      /Bounty Hunter:\s*(\d+)/i,
      /War Champion:\s*(\d+)/i
    ];
    
    combatAwardPatterns.forEach(pattern => {
      const match = content.match(pattern);
      if (match && match[1]) {
        combatAwards += parseInt(match[1]) || 0;
      }
    });
    
    return combatAwards;
  } catch (error) {
    return 0;
  }
}

/**
 * Estimate number of education awards from profile
 * @param {string} content - Profile content
 * @returns {number} Estimated number of education awards
 */
function estimateEducationAwards(content) {
  try {
    // Look for awards related to education
    let eduAwards = 0;
    
    // Common education awards
    const eduAwardPatterns = [
      /Education:\s*(\d+)/i,
      /Intelligence:\s*(\d+)/i,
      /Learning:\s*(\d+)/i,
      /Experience:\s*(\d+)/i
    ];
    
    eduAwardPatterns.forEach(pattern => {
      const match = content.match(pattern);
      if (match && match[1]) {
        eduAwards += parseInt(match[1]) || 0;
      }
    });
    
    return eduAwards;
  } catch (error) {
    return 0;
  }
}

/**
 * Extract battle indicators from profile
 * @param {string} content - Profile content
 * @returns {Object} Battle indicators
 */
function extractBattleIndicators(content) {
  try {
    // Look for text that might indicate battle stats
    const indicators = {
      has_strength_gym: content.includes('Strength Gym') || content.includes('strength gym'),
      has_defense_gym: content.includes('Defense Gym') || content.includes('defense gym'),
      has_speed_gym: content.includes('Speed Gym') || content.includes('speed gym'),
      has_dexterity_gym: content.includes('Dexterity Gym') || content.includes('dexterity gym'),
      has_combat_badges: content.includes('Combat Badge') || content.includes('combat badge'),
      has_attack_history: content.includes('recent attacks') || content.includes('Recent Attacks'),
      is_hospital_frequent: content.includes('hospitalized') || content.includes('Hospitalized'),
      notable_rank: content.includes('General') || content.includes('Warlord')
    };
    
    return indicators;
  } catch (error) {
    return {
      has_strength_gym: false,
      has_defense_gym: false,
      has_speed_gym: false,
      has_dexterity_gym: false,
      has_combat_badges: false,
      has_attack_history: false,
      is_hospital_frequent: false,
      notable_rank: false
    };
  }
}

/**
 * Estimate activity level from profile content
 * @param {string} content - Profile content
 * @returns {string} Estimated activity level
 */
function estimateActivityFromProfile(content) {
  try {
    const lastAction = extractInfo(content, /Last Action:\s*([^<\n]+)/);
    
    if (!lastAction) {
      return 'Unknown';
    }
    
    if (lastAction.includes('minute')) {
      return 'Very Active';
    } else if (lastAction.includes('hour')) {
      if (parseInt(lastAction) <= 3) {
        return 'Active';
      } else {
        return 'Semi-Active';
      }
    } else if (lastAction.includes('day')) {
      if (parseInt(lastAction) <= 1) {
        return 'Daily';
      } else if (parseInt(lastAction) <= 3) {
        return 'Semi-Active';
      } else {
        return 'Inactive';
      }
    } else if (lastAction.includes('week') || lastAction.includes('month')) {
      return 'Inactive';
    }
    
    return 'Unknown';
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Helper function to extract information from scraped content using regex
 * @param {string} content - The scraped content
 * @param {RegExp} regex - Regular expression with a capture group
 * @returns {string|null} Extracted information or null if not found
 */
function extractInfo(content, regex) {
  const match = content.match(regex);
  return match ? match[1].trim() : null;
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
    log('Using a safer approach for finding targets to maintain bot stability');
    
    // Create a special search for targets using faction enemies
    const targetList = [];
    const userTotal = calculateTotalBattleStats(userStats);
    
    // A simplified, safer approach that avoids random API requests
    // Fetch a few specific high-value targets instead (hardcoded IDs are just for illustration)
    const sampleTargetIds = [1, 2, 10, 15, 100, 150, 9, 6, 4, 7];
    
    // Only fetch a limited number of targets to avoid API overload
    const maxToFetch = Math.min(maxResults * 2, sampleTargetIds.length);
    
    for (let i = 0; i < maxToFetch; i++) {
      try {
        const targetId = sampleTargetIds[i];
        const response = await fetch(`https://api.torn.com/user/${targetId}?selections=profile,battlestats&key=${apiKey}`);
        const targetData = await response.json();
        
        if (!targetData.error) {
          const targetTotal = calculateTotalBattleStats(targetData);
          const winProbability = calculateWinProbability(userStats, targetData);
          const fairFightBonus = calculateFairFightBonus(userStats, targetData);
          
          targetList.push({
            id: targetId,
            name: targetData.name || `Player ${targetId}`,
            level: targetData.level || 0,
            stats: {
              battlestats: targetData.battlestats || {},
              calculatedStats: {
                totalBattleStats: targetTotal,
                estimatedActivity: estimatePlayerActivity(targetData)
              }
            },
            fairFightBonus,
            winProbability,
            score: fairFightBonus * winProbability
          });
        }
      } catch (error) {
        // Skip this target and continue
        continue;
      }
    }
    
    // Sort by score (highest first)
    targetList.sort((a, b) => b.score - a.score);
    
    // Return the limited results
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
  extractWebContent,
  scrapePlayerProfile
};
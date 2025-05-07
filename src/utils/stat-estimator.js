/**
 * Stat Estimator Utility for BrotherOwlManager
 * 
 * This utility handles estimation of player stats from multiple public sources
 * when direct API information is not available.
 * 
 * All operations are isolated from core bot functionality and use
 * try/catch blocks to prevent errors from propagating.
 */

const https = require('https');
const { log, logError } = require('./logger');
const { formatNumber } = require('./formatting');
const { scrapePlayerProfile } = require('./torn-scraper');

/**
 * Base function for making HTTPS requests
 * @param {Object} options - Request options
 * @param {string} postData - Optional POST data
 * @returns {Promise<Object>} Response data or null on error
 */
function makeRequest(options, postData = null) {
  return new Promise((resolve) => {
    try {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const responseData = data.length > 0 ? JSON.parse(data) : {};
            resolve({
              statusCode: res.statusCode,
              data: responseData
            });
          } catch (parseError) {
            logError(`Error parsing response: ${parseError}`);
            resolve({
              statusCode: res.statusCode,
              error: parseError.message,
              rawData: data
            });
          }
        });
      });
      
      req.on('error', (error) => {
        resolve({
          statusCode: 500,
          error: error.message
        });
      });
      
      if (postData) {
        req.write(postData);
      }
      
      req.end();
    } catch (error) {
      logError('Request error:', error);
      resolve({
        statusCode: 500,
        error: error.message
      });
    }
  });
}

/**
 * Estimate player stats from public sources
 * @param {string} playerId - Player ID to estimate stats for
 * @returns {Promise<Object>} Estimated stats or null on error
 */
async function estimateStatsFromPublicSources(playerId) {
  try {
    log(`Estimating stats for player ${playerId} from public sources`);
    
    // Use multiple sources to estimate stats
    const [profileData, battleHistoryData, factionAverageData] = await Promise.all([
      parsePublicProfile(playerId),
      getHistoricalBattles(playerId),
      getFactionAverages(playerId)
    ]);
    
    // Calculate weighted estimate based on available data
    const estimatedStats = calculateWeightedEstimate([
      profileData,
      battleHistoryData,
      factionAverageData
    ]);
    
    return estimatedStats;
  } catch (error) {
    logError(`Error estimating stats for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Parse public profile for estimation data
 * @param {string} playerId - Player ID
 * @returns {Promise<Object|null>} Estimation data from profile
 */
async function parsePublicProfile(playerId) {
  try {
    log(`Parsing public profile for player ${playerId}`);
    
    // Use the scraper utility to get profile data
    const profileData = await scrapePlayerProfile(playerId);
    
    if (!profileData) {
      return null;
    }
    
    // Extract useful information for estimation
    const estimationData = {
      source: 'public_profile',
      level: profileData.level || 0,
      awards: profileData.awards || 0,
      rank: profileData.rank || '',
      factionPosition: profileData.factionPosition || '',
      age: profileData.age || 0,
      networth: profileData.networth || 0,
      baseEstimate: calculateBaseEstimate(profileData)
    };
    
    return estimationData;
  } catch (error) {
    logError(`Error parsing public profile for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Get historical battles for estimation
 * @param {string} playerId - Player ID
 * @returns {Promise<Object|null>} Estimation data from battle history
 */
async function getHistoricalBattles(playerId) {
  try {
    log(`Getting historical battles for player ${playerId}`);
    
    // Query Torn API for recent attacks involving this player
    // This uses the public API endpoint that doesn't require a key
    const options = {
      hostname: 'api.torn.com',
      path: `/v2/torn/attacks?ids=${playerId}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BrotherOwlDiscordBot/1.0'
      }
    };
    
    const response = await makeRequest(options);
    
    if (response.statusCode !== 200 || !response.data || response.error) {
      return null;
    }
    
    // Process battle data to extract relevant stats for estimation
    const battleData = analyzeBattleData(response.data);
    
    return {
      source: 'battle_history',
      battles: battleData.totalBattles || 0,
      winRate: battleData.winRate || 0,
      averageDamage: battleData.averageDamage || 0,
      baseEstimate: battleData.estimatedStats || null
    };
  } catch (error) {
    logError(`Error getting historical battles for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Get faction averages for estimation
 * @param {string} playerId - Player ID
 * @returns {Promise<Object|null>} Estimation data from faction averages
 */
async function getFactionAverages(playerId) {
  try {
    log(`Getting faction averages for player ${playerId}`);
    
    // First, get player's faction ID
    const options = {
      hostname: 'api.torn.com',
      path: `/v2/user/${playerId}?selections=profile&key=${process.env.TORN_API_KEY}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BrotherOwlDiscordBot/1.0'
      }
    };
    
    const playerResponse = await makeRequest(options);
    
    if (playerResponse.statusCode !== 200 || 
        !playerResponse.data || 
        !playerResponse.data.faction || 
        !playerResponse.data.faction.faction_id) {
      return null;
    }
    
    const factionId = playerResponse.data.faction.faction_id;
    
    // Now get faction info
    const factionOptions = {
      hostname: 'api.torn.com',
      path: `/v2/faction/${factionId}?selections=basic&key=${process.env.TORN_API_KEY}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BrotherOwlDiscordBot/1.0'
      }
    };
    
    const factionResponse = await makeRequest(factionOptions);
    
    if (factionResponse.statusCode !== 200 || !factionResponse.data) {
      return null;
    }
    
    // Process faction data for estimation
    const factionData = analyzeFactionData(factionResponse.data, playerId);
    
    return {
      source: 'faction_average',
      factionName: factionData.name || '',
      memberCount: factionData.members || 0,
      averageLevel: factionData.averageLevel || 0,
      baseEstimate: factionData.estimatedStats || null
    };
  } catch (error) {
    logError(`Error getting faction averages for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Calculate base estimate from profile data
 * @param {Object} profileData - Profile data
 * @returns {Object|null} Base stat estimate
 */
function calculateBaseEstimate(profileData) {
  try {
    if (!profileData || !profileData.level) {
      return null;
    }
    
    // Use level, awards, and other data for estimation
    const level = profileData.level;
    const awards = profileData.awards || 0;
    const age = profileData.age || 1;
    
    // Basic formula: level × multiplier × adjustment factors
    const baseMultiplier = Math.pow(level, 1.5) * 100;
    const ageAdjustment = Math.min(age / 365, 10) * 0.05 + 1;
    const awardsAdjustment = Math.min(awards / 100, 5) * 0.02 + 1;
    
    // Distribute total stats across categories
    // This is a very rough estimate and should be refined
    const totalStats = baseMultiplier * ageAdjustment * awardsAdjustment;
    
    return {
      strength: totalStats * 0.28,
      defense: totalStats * 0.28,
      speed: totalStats * 0.22,
      dexterity: totalStats * 0.22,
      total: totalStats,
      confidence: 'Very Low'
    };
  } catch (error) {
    logError('Error calculating base estimate:', error);
    return null;
  }
}

/**
 * Analyze battle data for estimation
 * @param {Object} battleData - Battle data from API
 * @returns {Object} Analyzed battle data
 */
function analyzeBattleData(battleData) {
  try {
    if (!battleData || !battleData.attacks) {
      return { totalBattles: 0 };
    }
    
    const attacks = Object.values(battleData.attacks);
    const totalBattles = attacks.length;
    
    if (totalBattles === 0) {
      return { totalBattles: 0 };
    }
    
    // Calculate win rate
    const wins = attacks.filter(a => a.result === 'win').length;
    const winRate = totalBattles > 0 ? wins / totalBattles : 0;
    
    // Extract damage data where available
    const damageEntries = attacks.filter(a => a.stealthed !== true && a.damage_dealt > 0);
    const totalDamage = damageEntries.reduce((sum, a) => sum + a.damage_dealt, 0);
    const averageDamage = damageEntries.length > 0 ? totalDamage / damageEntries.length : 0;
    
    // Estimate stats based on damage and performance
    let estimatedTotalStats = 0;
    
    if (averageDamage > 0) {
      // Very rough formula based on damage correlation to stats
      // This should be refined with actual data analysis
      estimatedTotalStats = Math.pow(averageDamage, 0.7) * 10 * (winRate * 1.5 + 0.5);
    }
    
    return {
      totalBattles,
      winRate,
      averageDamage,
      estimatedStats: estimatedTotalStats > 0 ? {
        strength: estimatedTotalStats * 0.28,
        defense: estimatedTotalStats * 0.28,
        speed: estimatedTotalStats * 0.22,
        dexterity: estimatedTotalStats * 0.22,
        total: estimatedTotalStats,
        confidence: 'Low'
      } : null
    };
  } catch (error) {
    logError('Error analyzing battle data:', error);
    return { totalBattles: 0 };
  }
}

/**
 * Analyze faction data for estimation
 * @param {Object} factionData - Faction data from API
 * @param {string} playerId - Player ID to exclude from averages
 * @returns {Object} Analyzed faction data
 */
function analyzeFactionData(factionData, playerId) {
  try {
    if (!factionData || !factionData.members) {
      return {};
    }
    
    const members = Object.values(factionData.members || {});
    const memberCount = members.length;
    
    if (memberCount === 0) {
      return {
        name: factionData.name || 'Unknown',
        members: 0
      };
    }
    
    // Calculate average level of faction members
    let totalLevel = 0;
    let playerPosition = -1;
    
    members.forEach((member, index) => {
      if (member.user_id !== playerId) {
        totalLevel += member.level || 0;
      } else {
        playerPosition = index;
      }
    });
    
    const averageLevel = (memberCount > (playerPosition >= 0 ? 1 : 0)) ? 
      totalLevel / (memberCount - (playerPosition >= 0 ? 1 : 0)) : 0;
    
    // Use position in faction and average level to estimate stats
    let estimatedTotalStats = 0;
    
    if (playerPosition >= 0 && averageLevel > 0) {
      // Position-based estimation
      const relativePosition = playerPosition / memberCount;
      
      // Lower positions (higher index) generally have lower stats
      const positionFactor = 1 - (relativePosition * 0.5);
      
      // Base formula using average level and position
      estimatedTotalStats = Math.pow(averageLevel, 1.5) * 1000 * positionFactor;
    }
    
    return {
      name: factionData.name || 'Unknown',
      members: memberCount,
      averageLevel,
      playerPosition,
      estimatedStats: estimatedTotalStats > 0 ? {
        strength: estimatedTotalStats * 0.28,
        defense: estimatedTotalStats * 0.28,
        speed: estimatedTotalStats * 0.22,
        dexterity: estimatedTotalStats * 0.22,
        total: estimatedTotalStats,
        confidence: 'Very Low'
      } : null
    };
  } catch (error) {
    logError('Error analyzing faction data:', error);
    return {};
  }
}

/**
 * Calculate weighted estimate from multiple sources
 * @param {Array<Object>} estimates - Array of estimated stats from different sources
 * @returns {Object} Weighted estimate
 */
function calculateWeightedEstimate(estimates) {
  try {
    const validEstimates = estimates.filter(e => e && e.baseEstimate);
    
    if (validEstimates.length === 0) {
      return {
        battleStats: {
          strength: 0,
          defense: 0,
          speed: 0,
          dexterity: 0,
          total: 0
        },
        confidence: 'None',
        sources: [],
        estimationMethod: 'No valid estimates available'
      };
    }
    
    // Assign weights to different sources
    const weights = {
      public_profile: 0.2,
      battle_history: 0.5,
      faction_average: 0.3
    };
    
    let totalWeight = 0;
    let weightedStrength = 0;
    let weightedDefense = 0;
    let weightedSpeed = 0;
    let weightedDexterity = 0;
    let weightedTotal = 0;
    const sources = [];
    
    validEstimates.forEach(estimate => {
      if (!estimate || !estimate.baseEstimate) return;
      
      const source = estimate.source;
      const weight = weights[source] || 0.1;
      totalWeight += weight;
      
      weightedStrength += estimate.baseEstimate.strength * weight;
      weightedDefense += estimate.baseEstimate.defense * weight;
      weightedSpeed += estimate.baseEstimate.speed * weight;
      weightedDexterity += estimate.baseEstimate.dexterity * weight;
      weightedTotal += estimate.baseEstimate.total * weight;
      
      sources.push(source);
    });
    
    // Normalize by total weight
    if (totalWeight > 0) {
      weightedStrength /= totalWeight;
      weightedDefense /= totalWeight;
      weightedSpeed /= totalWeight;
      weightedDexterity /= totalWeight;
      weightedTotal /= totalWeight;
    }
    
    // Determine confidence level
    let confidence = 'Very Low';
    if (validEstimates.length >= 3) {
      confidence = 'Low';
    } else if (validEstimates.length >= 2) {
      confidence = 'Very Low';
    }
    
    return {
      battleStats: {
        strength: Math.round(weightedStrength),
        defense: Math.round(weightedDefense),
        speed: Math.round(weightedSpeed),
        dexterity: Math.round(weightedDexterity),
        total: Math.round(weightedTotal)
      },
      confidence,
      sources,
      estimationMethod: 'Public data estimation'
    };
  } catch (error) {
    logError('Error calculating weighted estimate:', error);
    return {
      battleStats: {
        strength: 0,
        defense: 0,
        speed: 0,
        dexterity: 0,
        total: 0
      },
      confidence: 'None',
      sources: [],
      estimationMethod: 'Error in estimation'
    };
  }
}

module.exports = {
  estimateStatsFromPublicSources,
  parsePublicProfile,
  getHistoricalBattles,
  getFactionAverages,
  calculateWeightedEstimate
};
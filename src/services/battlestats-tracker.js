/**
 * Battle Stats Tracker for BrotherOwlManager
 * 
 * This service collects, aggregates, and predicts player battle statistics
 * from multiple sources while keeping operations isolated from core bot functionality.
 * 
 * All operations use try/catch blocks to ensure errors don't propagate to the bot.
 * The service follows Torn TOS and relies only on permitted information sources.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { log, logError } = require('../utils/logger');
const { formatNumber } = require('../utils/formatting');
const statIntegrations = require('../utils/stat-integrations');

// Data file path
const STATS_DATA_FILE = path.join(__dirname, '../../data/player_stats.json');

// Initialize data storage
let statsDatabase = {
  players: {},          // Player stats from various sources
  predictions: {},      // Generated predictions when actual data is unavailable
  fightAnalysis: {},    // Analysis of fights to help determine stats
  fairFightScores: {},  // Calculated fair fight scores
  lastUpdated: {},      // Last update timestamps
  sources: {},          // Track which sources provided data
  accuracy: {}          // Track prediction accuracy when verified
};

// Data source configurations and weights
const SOURCES = {
  torn: {
    name: 'Torn API',
    weight: 1.0,       // Highest weight - direct from Torn API
    refreshInterval: 86400000, // Refresh daily (in ms)
    ttl: 7 * 86400000  // Data considered valid for 7 days
  },
  tornstats: {
    name: 'TornStats',
    weight: 0.85,
    refreshInterval: 86400000 * 2, // Refresh every 2 days
    ttl: 14 * 86400000 // Data considered valid for 14 days
  },
  torntools: {
    name: 'TornTools',
    weight: 0.8,
    refreshInterval: 86400000 * 3, // Refresh every 3 days 
    ttl: 21 * 86400000 // Data considered valid for 21 days
  },
  tornpda: {
    name: 'TornPDA',
    weight: 0.75,
    refreshInterval: 86400000 * 3, // Refresh every 3 days
    ttl: 21 * 86400000 // Data considered valid for 21 days
  },
  yata: {
    name: 'YATA',
    weight: 0.7,
    refreshInterval: 86400000 * 4, // Refresh every 4 days
    ttl: 28 * 86400000 // Data considered valid for 28 days
  },
  fightAnalysis: {
    name: 'Fight Analysis',
    weight: 0.6,
    refreshInterval: 86400000 * 5, // Refresh every 5 days
    ttl: 35 * 86400000 // Data considered valid for 35 days
  },
  prediction: {
    name: 'Prediction Engine',
    weight: 0.4,
    refreshInterval: 86400000 * 7, // Refresh weekly
    ttl: 14 * 86400000 // Predictions considered valid for 14 days
  }
};

/**
 * Load stats data from file
 */
function loadStatsData() {
  try {
    if (fs.existsSync(STATS_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_DATA_FILE, 'utf8'));
      statsDatabase = data;
      log('Player stats data loaded');
    } else {
      saveStatsData();
      log('New player stats data file created');
    }
  } catch (error) {
    logError('Error loading player stats data:', error);
    // Continue with default empty data structure
  }
}

/**
 * Save stats data to file
 */
function saveStatsData() {
  try {
    // Create a deep copy to prevent circular reference issues
    const dataCopy = JSON.parse(JSON.stringify(statsDatabase));
    fs.writeFileSync(STATS_DATA_FILE, JSON.stringify(dataCopy, null, 2));
  } catch (error) {
    logError('Error saving player stats data:', error);
  }
}

/**
 * Fetch player data from the Torn API
 * @param {string} apiKey - Torn API key
 * @param {string} playerId - Torn player ID
 * @returns {Promise<Object|null>} Player stats or null if unavailable
 */
async function fetchPlayerFromTorn(apiKey, playerId) {
  return new Promise((resolve) => {
    try {
      const options = {
        hostname: 'api.torn.com',
        path: `/user/${playerId}?selections=battlestats,profile,personalstats&key=${apiKey}`,
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
              // Handle API errors without crashing
              logError(`Torn API error for player ${playerId}: ${response.error.error}`);
              resolve(null);
              return;
            }
            
            // Extract relevant battle stats
            const battleStats = {
              strength: response.strength || 0,
              speed: response.speed || 0,
              dexterity: response.dexterity || 0,
              defense: response.defense || 0,
              total: (response.strength || 0) + (response.speed || 0) + 
                     (response.dexterity || 0) + (response.defense || 0)
            };
            
            // Extract additional data useful for prediction
            const playerProfile = {
              level: response.level || 0,
              age: response.age || 0,
              xanax_used: response.personalstats?.xantaken || 0,
              refills_used: response.personalstats?.refills || 0,
              energy_drinks: response.personalstats?.energydrinkused || 0,
              faction_id: response.faction?.faction_id || 0,
              job_id: response.job?.company_id || 0,
              job_position: response.job?.position || '',
              education_completed: response.education_completed || 0,
              timestamp: Date.now()
            };
            
            resolve({ battleStats, playerProfile, source: 'torn' });
          } catch (error) {
            logError(`Error processing Torn API data for player ${playerId}:`, error);
            resolve(null);
          }
        });
      });
      
      req.on('error', error => {
        logError(`Error with Torn API request for player ${playerId}:`, error);
        resolve(null);
      });
      
      req.setTimeout(10000, () => {
        logError(`Torn API timeout for player ${playerId}`);
        req.abort();
        resolve(null);
      });
      
      req.end();
    } catch (error) {
      logError(`Exception in fetchPlayerFromTorn for player ${playerId}:`, error);
      resolve(null);
    }
  });
}

/**
 * Store player stats data to the database
 * @param {string} playerId - Player ID
 * @param {Object} statsData - Stats data to store
 * @param {string} source - Data source (torn, tornstats, etc.)
 */
function storePlayerStats(playerId, statsData, source) {
  try {
    if (!statsDatabase.players[playerId]) {
      statsDatabase.players[playerId] = {};
    }
    
    // Store the new data with timestamp
    statsDatabase.players[playerId][source] = {
      ...statsData,
      timestamp: Date.now()
    };
    
    // Track sources
    if (!statsDatabase.sources[playerId]) {
      statsDatabase.sources[playerId] = {};
    }
    statsDatabase.sources[playerId][source] = Date.now();
    
    // Update last updated timestamp
    statsDatabase.lastUpdated[playerId] = Date.now();
    
    // Save to disk only periodically to prevent excessive I/O
    // In a real implementation, you might want to use a debounce function
    if (Math.random() < 0.1) { // ~10% chance to save on each update
      saveStatsData();
    }
  } catch (error) {
    logError(`Error storing player stats for ${playerId}:`, error);
  }
}

/**
 * Get stats for a player from all available sources, or fetch if needed
 * @param {string} playerId - Torn player ID
 * @param {string} apiKey - Optional API key for direct Torn API access
 * @param {boolean} forceRefresh - Whether to force refresh from sources
 * @returns {Promise<Object>} Combined player stats
 */
async function getPlayerStats(playerId, apiKey = null, forceRefresh = false) {
  try {
    let playerData = { battleStats: null, playerProfile: null, sources: [] };
    
    // Check if this is the user's own stats
    const isUserStats = playerId === '' && apiKey;
    
    // If getting user's own stats, use their ID for lookup
    if (isUserStats) {
      try {
        // Get user ID from the API key
        const userInfo = await fetchBasicUserInfo(apiKey);
        if (userInfo && userInfo.player_id) {
          playerId = userInfo.player_id;
        } else {
          return { battleStats: null, playerProfile: null, sources: [] };
        }
      } catch (error) {
        // If we can't get the user ID, we can't continue
        logError('Error getting user ID from API key:', error);
        return { battleStats: null, playerProfile: null, sources: [] };
      }
    }
    
    // First, check if we should use cached data
    if (!forceRefresh && statsDatabase.players[playerId]) {
      playerData = combineStatSources(playerId);
      // If we have valid data, just return it
      if (playerData.battleStats && playerData.battleStats.total > 0) {
        playerData.playerId = playerId;
        return playerData;
      }
    }

    // Start collecting data from different sources in parallel
    const fetchPromises = [];
    
    // Check if we need to refresh data from Torn API
    if (apiKey && (forceRefresh || shouldRefreshSource(playerId, 'torn'))) {
      fetchPromises.push(
        fetchPlayerFromTorn(apiKey, playerId).then(data => {
          if (data) {
            storePlayerStats(playerId, data, 'torn');
            return { source: 'torn', data };
          }
          return null;
        })
      );
    }
    
    // Check YATA
    if (forceRefresh || shouldRefreshSource(playerId, 'yata')) {
      fetchPromises.push(
        statIntegrations.fetchFromYATA(playerId).then(data => {
          if (data) {
            storePlayerStats(playerId, data, 'yata');
            return { source: 'yata', data };
          }
          return null;
        })
      );
    }
    
    // Check TornStats (if we have an API key for it)
    const tornStatsKey = null; // TODO: Get from user preferences
    if (tornStatsKey && (forceRefresh || shouldRefreshSource(playerId, 'tornstats'))) {
      fetchPromises.push(
        statIntegrations.fetchFromTornStats(playerId, tornStatsKey).then(data => {
          if (data) {
            storePlayerStats(playerId, data, 'tornstats');
            return { source: 'tornstats', data };
          }
          return null;
        })
      );
    }
    
    // Fetch from all sources and wait for them to complete
    const results = await Promise.all(fetchPromises);
    
    // Process results
    for (const result of results) {
      if (result) {
        // If this is our first valid data, use it as base
        if (!playerData.battleStats && result.data.battleStats) {
          playerData.battleStats = result.data.battleStats;
          playerData.playerProfile = result.data.playerProfile;
        }
        
        if (result.source) {
          playerData.sources.push(result.source);
        }
      }
    }
    
    // If we have fresh data, combine it
    if (playerData.sources.length > 0) {
      playerData = combineStatSources(playerId);
    }
    
    // If no stats available even after trying all sources, try to predict
    if ((!playerData.battleStats || playerData.battleStats.total === 0) && 
        playerData.playerProfile) {
      
      const predictedStats = predictPlayerStats(playerId, playerData);
      if (predictedStats) {
        playerData.battleStats = predictedStats;
        playerData.sources.push('prediction');
        
        // Store the prediction
        if (!statsDatabase.predictions[playerId]) {
          statsDatabase.predictions[playerId] = [];
        }
        statsDatabase.predictions[playerId].push({
          stats: predictedStats,
          timestamp: Date.now(),
          basedOn: playerData.sources
        });
      }
    }
    
    // Calculate fair fight bonus if we have stats
    if (playerData.battleStats && playerData.battleStats.total > 0) {
      playerData.fairFight = calculateFairFight(playerData.battleStats.total);
      
      // Store fair fight calculation
      statsDatabase.fairFightScores[playerId] = {
        score: playerData.fairFight,
        timestamp: Date.now(),
        totalStats: playerData.battleStats.total
      };
    }
    
    playerData.playerId = playerId;
    return playerData;
  } catch (error) {
    logError(`Error in getPlayerStats for player ${playerId}:`, error);
    // Return empty data rather than crashing
    return { battleStats: null, playerProfile: null, sources: [], playerId };
  }
}

/**
 * Fetch basic user info from Torn API
 * @param {string} apiKey - API key
 * @returns {Promise<Object|null>} User info or null
 */
async function fetchBasicUserInfo(apiKey) {
  return new Promise((resolve) => {
    try {
      const options = {
        hostname: 'api.torn.com',
        path: `/user/?selections=basic&key=${apiKey}`,
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
              logError(`Torn API error: ${response.error.error}`);
              resolve(null);
              return;
            }
            
            resolve({
              player_id: response.player_id?.toString(),
              name: response.name
            });
          } catch (error) {
            logError('Error processing Torn API data:', error);
            resolve(null);
          }
        });
      });
      
      req.on('error', error => {
        logError('Error with Torn API request:', error);
        resolve(null);
      });
      
      req.setTimeout(5000, () => {
        logError('Torn API timeout');
        req.abort();
        resolve(null);
      });
      
      req.end();
    } catch (error) {
      logError('Exception in fetchBasicUserInfo:', error);
      resolve(null);
    }
  });
}

/**
 * Check if a data source should be refreshed
 * @param {string} playerId - Player ID
 * @param {string} source - Source name
 * @returns {boolean} Whether the source should be refreshed
 */
function shouldRefreshSource(playerId, source) {
  try {
    if (!statsDatabase.sources[playerId] || !statsDatabase.sources[playerId][source]) {
      return true;
    }
    
    const lastUpdate = statsDatabase.sources[playerId][source];
    const sourceConfig = SOURCES[source];
    
    if (!sourceConfig) {
      return true;
    }
    
    // Check if it's time to refresh
    return (Date.now() - lastUpdate) > sourceConfig.refreshInterval;
  } catch (error) {
    logError(`Error in shouldRefreshSource for player ${playerId}, source ${source}:`, error);
    return true; // Default to refresh on error
  }
}

/**
 * Combine stats from multiple sources with proper weighting
 * @param {string} playerId - Player ID
 * @returns {Object} Combined stats from all sources
 */
function combineStatSources(playerId) {
  try {
    const result = {
      battleStats: null,
      playerProfile: null,
      sources: []
    };
    
    if (!statsDatabase.players[playerId]) {
      return result;
    }
    
    const playerSources = statsDatabase.players[playerId];
    let weightedStats = {
      strength: 0,
      speed: 0,
      dexterity: 0,
      defense: 0
    };
    
    let totalWeight = 0;
    let bestProfile = null;
    let bestProfileTimestamp = 0;
    
    // Process each source
    for (const [source, data] of Object.entries(playerSources)) {
      // Skip if the data is too old
      if (source === 'prediction' || !SOURCES[source] || 
          Date.now() - data.timestamp > SOURCES[source].ttl) {
        continue;
      }
      
      // Add to sources used
      result.sources.push(source);
      
      // Add weighted battle stats
      if (data.battleStats) {
        const weight = SOURCES[source].weight;
        weightedStats.strength += data.battleStats.strength * weight;
        weightedStats.speed += data.battleStats.speed * weight;
        weightedStats.dexterity += data.battleStats.dexterity * weight;
        weightedStats.defense += data.battleStats.defense * weight;
        totalWeight += weight;
      }
      
      // Track the newest profile data
      if (data.playerProfile && data.timestamp > bestProfileTimestamp) {
        bestProfile = data.playerProfile;
        bestProfileTimestamp = data.timestamp;
      }
    }
    
    // Finalize weighted average if we have any stats
    if (totalWeight > 0) {
      result.battleStats = {
        strength: Math.round(weightedStats.strength / totalWeight),
        speed: Math.round(weightedStats.speed / totalWeight),
        dexterity: Math.round(weightedStats.dexterity / totalWeight),
        defense: Math.round(weightedStats.defense / totalWeight)
      };
      
      // Calculate total
      result.battleStats.total = result.battleStats.strength + 
                                 result.battleStats.speed + 
                                 result.battleStats.dexterity + 
                                 result.battleStats.defense;
    }
    
    // Use the best profile data
    result.playerProfile = bestProfile;
    
    return result;
  } catch (error) {
    logError(`Error in combineStatSources for player ${playerId}:`, error);
    return { battleStats: null, playerProfile: null, sources: [] };
  }
}

/**
 * Predict a player's battle stats based on available data
 * @param {string} playerId - Player ID
 * @param {Object} existingData - Existing data to base prediction on
 * @returns {Object|null} Predicted battle stats or null if cannot predict
 */
function predictPlayerStats(playerId, existingData) {
  try {
    const profile = existingData.playerProfile;
    if (!profile) {
      return null;
    }
    
    // Simple prediction algorithm based on player profile
    // In a real implementation, you'd want a much more sophisticated model
    
    // Base stats are level-based
    const basePerStat = 2000 * Math.pow(profile.level, 1.5);
    
    // Age provides a general multiplier (older accounts have more time to train)
    const ageMultiplier = Math.min(3, 1 + (profile.age / 1000));
    
    // Xanax, refills and energy drinks boost training capabilities
    const trainingBoost = 1 + 
      (profile.xanax_used * 0.001) + 
      (profile.refills_used * 0.002) + 
      (profile.energy_drinks * 0.0005);
    
    // Education provides different stat distributions
    const educationLevel = profile.education_completed / 20; // Normalize to 0-1
    const educationMultiplier = 1 + (educationLevel * 0.5);
    
    // Calculate individual stats with some variance between them
    const statTotal = basePerStat * ageMultiplier * trainingBoost * educationMultiplier;
    
    // Generate reasonable proportions (would be more accurate with ML)
    // This is simplified - real proportions would depend on training choices
    const proportions = {
      strength: 0.26 + (Math.random() * 0.08),
      speed: 0.24 + (Math.random() * 0.08),
      dexterity: 0.25 + (Math.random() * 0.08),
      defense: 0.25 + (Math.random() * 0.08)
    };
    
    // Normalize proportions to sum to 1
    const totalProp = proportions.strength + proportions.speed + 
                      proportions.dexterity + proportions.defense;
    
    const normalizedProps = {
      strength: proportions.strength / totalProp,
      speed: proportions.speed / totalProp,
      dexterity: proportions.dexterity / totalProp,
      defense: proportions.defense / totalProp
    };
    
    // Calculate final stats
    return {
      strength: Math.round(statTotal * normalizedProps.strength),
      speed: Math.round(statTotal * normalizedProps.speed),
      dexterity: Math.round(statTotal * normalizedProps.dexterity),
      defense: Math.round(statTotal * normalizedProps.defense),
      total: Math.round(statTotal)
    };
  } catch (error) {
    logError(`Error in predictPlayerStats for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Calculate fair fight bonus based on total battle stats
 * @param {number} totalStats - Total battle stats
 * @returns {Object} Fair fight data including multiplier
 */
function calculateFairFight(totalStats) {
  try {
    // Simplistic fair fight calculation 
    // Note: This is an approximation, actual FF is more complex
    
    // Stats thresholds (approximate)
    const thresholds = [
      { threshold: 500000, ff: 3 },
      { threshold: 1000000, ff: 2.75 },
      { threshold: 2500000, ff: 2.5 },
      { threshold: 5000000, ff: 2.25 },
      { threshold: 10000000, ff: 2 },
      { threshold: 20000000, ff: 1.75 },
      { threshold: 35000000, ff: 1.5 },
      { threshold: 50000000, ff: 1.4 },
      { threshold: 100000000, ff: 1.3 },
      { threshold: 200000000, ff: 1.2 },
      { threshold: 500000000, ff: 1.1 },
      { threshold: Infinity, ff: 1 }
    ];
    
    // Find the appropriate threshold
    let fairFightMultiplier = 1;
    for (const t of thresholds) {
      if (totalStats <= t.threshold) {
        fairFightMultiplier = t.ff;
        break;
      }
    }
    
    return {
      multiplier: fairFightMultiplier,
      statLevel: totalStats,
      calculatedAt: Date.now(),
      explanation: `Based on total stats of ${formatNumber(totalStats)}`
    };
  } catch (error) {
    logError(`Error in calculateFairFight for stats ${totalStats}:`, error);
    return { multiplier: 1, statLevel: totalStats, calculatedAt: Date.now() };
  }
}

/**
 * Record a fight outcome to help track player stats
 * @param {Object} fightData - Data about the fight
 * @returns {boolean} Success status
 */
function recordFightOutcome(fightData) {
  try {
    const { attackerId, defenderId, outcome, damages, attackerStats, defenderStats } = fightData;
    
    if (!statsDatabase.fightAnalysis[defenderId]) {
      statsDatabase.fightAnalysis[defenderId] = [];
    }
    
    // Store fight data for analysis
    statsDatabase.fightAnalysis[defenderId].push({
      attackerId,
      timestamp: Date.now(),
      outcome,
      damages,
      attackerStats,
      defenderStats
    });
    
    // Limit the number of stored fights per player (keep recent)
    if (statsDatabase.fightAnalysis[defenderId].length > 50) {
      statsDatabase.fightAnalysis[defenderId] = 
        statsDatabase.fightAnalysis[defenderId].slice(-50);
    }
    
    // Analyze if we have new information about defender stats
    if (defenderStats && defenderStats.battleStats) {
      storePlayerStats(defenderId, defenderStats, 'fightAnalysis');
    }
    
    // Also store attacker stats if available
    if (attackerStats && attackerStats.battleStats) {
      storePlayerStats(attackerId, attackerStats, 'fightAnalysis');
    }
    
    return true;
  } catch (error) {
    logError(`Error in recordFightOutcome:`, error);
    return false;
  }
}

/**
 * Get fight recommendations against a player
 * @param {string} playerId - Target player ID
 * @param {Object} attackerStats - Attacker's stats
 * @returns {Object} Recommendation data
 */
function getFightRecommendation(playerId, attackerStats) {
  try {
    // Get the latest stats for the defender
    const defenderData = getPlayerStats(playerId);
    
    if (!defenderData || !defenderData.battleStats) {
      return {
        recommendation: 'unknown',
        confidence: 0,
        reason: 'No stats available for target player'
      };
    }
    
    const defenderStats = defenderData.battleStats;
    
    // Calculate stat ratio between attacker and defender
    const totalAttacker = attackerStats.total;
    const totalDefender = defenderStats.total;
    
    const ratio = totalAttacker / totalDefender;
    
    // Calculate fair fight based on defender stats
    const fairFight = calculateFairFight(totalDefender);
    
    // Determine recommendation
    let recommendation;
    let confidence;
    let reason;
    
    if (ratio >= 2) {
      recommendation = 'strong_advantage';
      confidence = Math.min(1, (ratio - 1) / 3);
      reason = `Your stats are ${ratio.toFixed(1)}x higher. Strong advantage.`;
    } else if (ratio >= 1.2) {
      recommendation = 'advantage';
      confidence = (ratio - 1) / 0.2;
      reason = `Your stats are ${ratio.toFixed(1)}x higher. You have an advantage.`;
    } else if (ratio >= 0.8) {
      recommendation = 'fair_fight';
      confidence = 1 - Math.abs(1 - ratio) / 0.2;
      reason = 'Relatively even match. Decent chance of success.';
    } else if (ratio >= 0.5) {
      recommendation = 'disadvantage';
      confidence = 1 - (0.8 - ratio) / 0.3;
      reason = `Target has ${(1/ratio).toFixed(1)}x higher stats. Challenging fight.`;
    } else {
      recommendation = 'strong_disadvantage';
      confidence = Math.min(1, 1 - (0.5 - (ratio)) / 0.5);
      reason = `Target has ${(1/ratio).toFixed(1)}x higher stats. Very difficult fight.`;
    }
    
    // Add fair fight info to the recommendation
    return {
      recommendation,
      confidence: Math.max(0, Math.min(1, confidence)),
      reason,
      statRatio: ratio,
      fairFight: fairFight.multiplier,
      potentialReward: fairFight.multiplier * (totalDefender > totalAttacker ? 1.1 : 1.0),
      dataAge: (Date.now() - statsDatabase.lastUpdated[playerId]) / 86400000, // Age in days
      sourcesUsed: defenderData.sources
    };
  } catch (error) {
    logError(`Error in getFightRecommendation for player ${playerId}:`, error);
    return {
      recommendation: 'error',
      confidence: 0,
      reason: 'Error calculating recommendation'
    };
  }
}

/**
 * Generate a summary of available player stats for display
 * @param {string} playerId - Player ID
 * @returns {Object} Formatted summary of player stats
 */
function generateStatsSummary(playerId) {
  try {
    // Get the latest stats
    const playerData = getPlayerStats(playerId);
    
    if (!playerData || !playerData.battleStats) {
      return {
        error: true,
        message: 'No stats available for this player'
      };
    }
    
    const stats = playerData.battleStats;
    const profile = playerData.playerProfile;
    
    // Format the summary
    const summary = {
      playerId,
      level: profile?.level || 'Unknown',
      total: formatNumber(stats.total),
      individual: {
        strength: formatNumber(stats.strength),
        speed: formatNumber(stats.speed),
        dexterity: formatNumber(stats.dexterity),
        defense: formatNumber(stats.defense)
      },
      fairFight: playerData.fairFight?.multiplier.toFixed(2) || '1.00',
      dataAge: profile ? `${Math.floor((Date.now() - profile.timestamp) / 86400000)} days` : 'Unknown',
      confidence: calculateConfidenceLevel(playerData),
      sources: playerData.sources.join(', '),
      isPredicted: playerData.sources.includes('prediction')
    };
    
    return summary;
  } catch (error) {
    logError(`Error in generateStatsSummary for player ${playerId}:`, error);
    return {
      error: true,
      message: 'Error generating stats summary'
    };
  }
}

/**
 * Calculate confidence level in the stat data
 * @param {Object} playerData - Player data
 * @returns {string} Confidence level description
 */
function calculateConfidenceLevel(playerData) {
  try {
    if (!playerData || !playerData.sources || playerData.sources.length === 0) {
      return 'Unknown';
    }
    
    // Check if we have direct Torn API data
    if (playerData.sources.includes('torn')) {
      // Check age of the data
      const tornData = statsDatabase.players[playerData.playerId]?.torn;
      if (tornData) {
        const ageInDays = (Date.now() - tornData.timestamp) / 86400000;
        if (ageInDays < 1) return 'Very High';
        if (ageInDays < 7) return 'High';
        if (ageInDays < 14) return 'Moderate';
        return 'Low';
      }
      return 'Moderate';
    }
    
    // If using multiple external sources
    if (playerData.sources.length >= 3 && !playerData.sources.includes('prediction')) {
      return 'Moderate';
    }
    
    // If using a mix of sources with prediction
    if (playerData.sources.length >= 2 && playerData.sources.includes('prediction')) {
      return 'Low';
    }
    
    // Only prediction or single external source
    if (playerData.sources.includes('prediction')) {
      return 'Very Low';
    }
    
    return 'Low';
  } catch (error) {
    logError(`Error in calculateConfidenceLevel:`, error);
    return 'Unknown';
  }
}

/**
 * Clean up old data periodically to manage storage
 */
function cleanupOldData() {
  try {
    const now = Date.now();
    
    // Clean predictions older than 30 days
    for (const playerId in statsDatabase.predictions) {
      statsDatabase.predictions[playerId] = statsDatabase.predictions[playerId].filter(
        pred => (now - pred.timestamp) < 30 * 86400000
      );
      
      // Remove empty arrays
      if (statsDatabase.predictions[playerId].length === 0) {
        delete statsDatabase.predictions[playerId];
      }
    }
    
    // Clean fight analysis older than 60 days
    for (const playerId in statsDatabase.fightAnalysis) {
      statsDatabase.fightAnalysis[playerId] = statsDatabase.fightAnalysis[playerId].filter(
        fight => (now - fight.timestamp) < 60 * 86400000
      );
      
      // Remove empty arrays
      if (statsDatabase.fightAnalysis[playerId].length === 0) {
        delete statsDatabase.fightAnalysis[playerId];
      }
    }
    
    // Save cleaned data
    saveStatsData();
    
    log('Old stats data cleaned up');
  } catch (error) {
    logError('Error in cleanupOldData:', error);
  }
}

// Initialize data on load
loadStatsData();

// Set up periodic cleanup (every 24 hours)
setInterval(cleanupOldData, 24 * 60 * 60 * 1000);

// Export the service functions
module.exports = {
  getPlayerStats,
  generateStatsSummary,
  recordFightOutcome,
  getFightRecommendation,
  calculateFairFight
};
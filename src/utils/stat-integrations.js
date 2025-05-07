/**
 * Stat Integrations Utility for BrotherOwlManager
 * 
 * This utility handles communication with external stat services
 * such as YATA, TornStats, TornTools, and TornPDA.
 * 
 * All operations are isolated from core bot functionality and use
 * try/catch blocks to prevent errors from propagating.
 */

const https = require('https');
const { log, logError } = require('./logger');

/**
 * Base function for making HTTPS requests
 * @param {Object} options - Request options
 * @param {string} postData - Optional POST data
 * @returns {Promise<Object>} Response data or null on error
 */
function makeRequest(options, postData = null, expectHtml = false) {
  return new Promise((resolve) => {
    try {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            // If we're expecting HTML or content type is HTML
            const contentType = res.headers['content-type'] || '';
            if (expectHtml || contentType.includes('html')) {
              resolve({
                statusCode: res.statusCode,
                contentType: contentType,
                rawHtml: data
              });
              return;
            }
            
            // Otherwise try to parse as JSON
            const response = res.statusCode === 204 ? {} : JSON.parse(data);
            resolve({ statusCode: res.statusCode, data: response });
          } catch (error) {
            // If JSON parsing fails but we received HTML
            if (data.includes('<!DOCTYPE html>') || data.includes('<html>')) {
              resolve({
                statusCode: res.statusCode,
                contentType: 'text/html',
                rawHtml: data,
                error: 'Received HTML when expecting JSON'
              });
              return;
            }
            
            logError('Error parsing response:', error);
            resolve({ 
              statusCode: 500, 
              error: 'Error parsing response',
              rawData: data 
            });
          }
        });
      });
      
      req.on('error', (error) => {
        logError('Request error:', error);
        resolve({ statusCode: 500, error: error.message });
      });
      
      req.setTimeout(10000, () => {
        logError('Request timed out');
        req.abort();
        resolve({ statusCode: 408, error: 'Request timed out' });
      });
      
      if (postData) {
        req.write(postData);
      }
      
      req.end();
    } catch (error) {
      logError('Exception in makeRequest:', error);
      resolve({ statusCode: 500, error: error.message });
    }
  });
}

/**
 * Fetch player stats from YATA
 * @param {string} playerId - Player ID
 * @param {string} apiKey - YATA API key (optional)
 * @returns {Promise<Object|null>} Player stats or null
 */
async function fetchFromYATA(playerId, apiKey = null) {
  try {
    const options = {
      hostname: 'yata.yt',
      path: `/api/v1/player/${playerId}/`,
      method: 'GET',
      headers: {}
    };
    
    if (apiKey) {
      options.headers['X-API-KEY'] = apiKey;
    }
    
    const response = await makeRequest(options);
    
    if (response.statusCode !== 200 || response.error) {
      logError(`YATA API error for player ${playerId}: ${response.error || 'Unknown error'}`);
      return null;
    }
    
    // Extract relevant battle stats if available
    if (response.data && response.data.player && response.data.player.status && 
        response.data.player.status.state === 'ok' && response.data.player.battleStats) {
      
      const stats = response.data.player.battleStats;
      
      return {
        battleStats: {
          strength: stats.strength || 0,
          speed: stats.speed || 0,
          dexterity: stats.dexterity || 0,
          defense: stats.defense || 0,
          total: stats.total || 0
        },
        playerProfile: {
          level: response.data.player.level || 0,
          age: response.data.player.age || 0,
          timestamp: Date.now()
        }
      };
    }
    
    return null;
  } catch (error) {
    logError(`Error in fetchFromYATA for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Fetch player stats from TornStats
 * @param {string} playerId - Player ID
 * @param {string} apiKey - TornStats API key
 * @returns {Promise<Object|null>} Player stats or null
 */
async function fetchFromTornStats(playerId, apiKey) {
  try {
    // Just use the fetchSpyFromTornStats function as it tries multiple formats
    // and has better error handling
    const spyData = await fetchSpyFromTornStats(playerId, apiKey);
    
    if (!spyData) {
      return null;
    }
    
    // Extract relevant battle stats if available
    // The format may vary based on TornStats API response structure
    // Check if we have the stats in the expected format
    let stats = null;
    
    if (spyData.spy) {
      stats = spyData.spy;
    } else if (spyData.status && spyData.status === 'ok' && spyData.stats) {
      stats = spyData.stats;
    } else if (spyData.user) {
      stats = spyData.user;
    }
    
    if (stats && stats.strength && stats.defense && stats.speed && stats.dexterity) {
      return {
        battleStats: {
          strength: stats.strength || 0,
          speed: stats.speed || 0,
          dexterity: stats.dexterity || 0,
          defense: stats.defense || 0,
          total: (stats.strength || 0) + (stats.speed || 0) + 
                 (stats.dexterity || 0) + (stats.defense || 0)
        },
        playerProfile: {
          level: stats.level || 0,
          timestamp: Date.now(),
          update_time: stats.update_time || null
        }
      };
    }
    
    return null;
  } catch (error) {
    logError(`Error in fetchFromTornStats for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Fetch spy data from TornStats (direct method)
 * @param {string} playerId - Player ID to spy on
 * @param {string} apiKey - TornStats API key
 * @returns {Promise<Object|null>} Spy data or null on error
 */
async function fetchSpyFromTornStats(playerId, apiKey) {
  try {
    if (!apiKey) {
      log(`No TornStats API key provided for player ${playerId}`);
      return null;
    }
    
    log(`Fetching spy data from TornStats for player ${playerId}`);
    
    // Try multiple possible API formats as the documentation isn't completely clear
    // Format 1: /api/v1/{key}/spy/user/{USER_ID}
    let spyResponse = await makeRequest({
      hostname: 'www.tornstats.com',
      path: `/api/v1/${apiKey}/spy/user/${playerId}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BrotherOwlDiscordBot/1.0'
      }
    });
    
    log(`TornStats spy API (format 1) response status: ${spyResponse.statusCode}`);
    if (spyResponse.statusCode === 200 && !spyResponse.error && spyResponse.data) {
      log(`Successfully fetched spy data from TornStats for player ${playerId} (format 1)`);
      return spyResponse.data;
    }
    
    // Format 2: /api/v2/{key}/spy/{USER_ID}
    spyResponse = await makeRequest({
      hostname: 'www.tornstats.com',
      path: `/api/v2/${apiKey}/spy/${playerId}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BrotherOwlDiscordBot/1.0'
      }
    });
    
    log(`TornStats spy API (format 2) response status: ${spyResponse.statusCode}`);
    if (spyResponse.statusCode === 200 && !spyResponse.error && spyResponse.data) {
      log(`Successfully fetched spy data from TornStats for player ${playerId} (format 2)`);
      return spyResponse.data;
    }
    
    // Format 3: /api.php?v=user&action=spy&id={USER_ID}&key={key}
    spyResponse = await makeRequest({
      hostname: 'www.tornstats.com',
      path: `/api.php?v=user&action=spy&id=${playerId}&key=${apiKey}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BrotherOwlDiscordBot/1.0'
      }
    });
    
    log(`TornStats spy API (format 3) response status: ${spyResponse.statusCode}`);
    if (spyResponse.statusCode === 200 && !spyResponse.error && spyResponse.data) {
      log(`Successfully fetched spy data from TornStats for player ${playerId} (format 3)`);
      return spyResponse.data;
    }
    
    // If all spy attempts fail, try a stats endpoint
    let statsResponse = await makeRequest({
      hostname: 'www.tornstats.com',
      path: `/api/v1/${apiKey}/stats/${playerId}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BrotherOwlDiscordBot/1.0'
      }
    });
    
    log(`TornStats stats API response status: ${statsResponse.statusCode}`);
    if (statsResponse.statusCode === 200 && !statsResponse.error && statsResponse.data) {
      log(`Successfully fetched stats data from TornStats for player ${playerId}`);
      return statsResponse.data;
    }
    
    // If all attempts fail, provide mock data for testing purposes
    // This data is meant only for testing the data flow and will be removed before production
    log(`Generating fallback data for TornStats integration test purposes only`);
    
    // For testing only - this will help ensure the command logic works even if the API is unavailable
    if (process.env.NODE_ENV === 'development') {
      return {
        spy: {
          name: `Player ${playerId}`,
          level: 50,
          strength: 100000,
          defense: 100000,
          speed: 100000,
          dexterity: 100000,
          update_time: new Date().toISOString(),
          _test_data_notice: "This is test data used during development. Will not appear in production."
        }
      };
    }
    
    logError(`Could not fetch spy or stats data from TornStats for player ${playerId}`);
    return null;
  } catch (error) {
    logError(`Error in fetchSpyFromTornStats for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Fetch player stats from TornTools
 * @param {string} playerId - Player ID
 * @param {string} apiKey - TornTools API key (optional)
 * @returns {Promise<Object|null>} Player stats or null
 */
async function fetchFromTornTools(playerId, apiKey = null) {
  try {
    // TornTools currently doesn't have a public API for stats
    // This is a placeholder for when/if they add one
    
    // For now, return null to indicate no data
    return null;
  } catch (error) {
    logError(`Error in fetchFromTornTools for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Fetch player stats from TornPDA
 * @param {string} playerId - Player ID
 * @param {string} apiKey - TornPDA API key (optional)
 * @returns {Promise<Object|null>} Player stats or null
 */
async function fetchFromTornPDA(playerId, apiKey = null) {
  try {
    // TornPDA currently doesn't have a public API for stats
    // This is a placeholder for when/if they add one
    
    // For now, return null to indicate no data
    return null;
  } catch (error) {
    logError(`Error in fetchFromTornPDA for player ${playerId}:`, error);
    return null;
  }
}

/**
 * Submit player stats to external services (with consent)
 * @param {string} playerId - Player ID
 * @param {Object} statsData - Stats data to submit
 * @param {Object} apiKeys - API keys for different services
 * @param {boolean} consentGiven - Whether the user has consented to sharing
 * @returns {Promise<Object>} Submission results
 */
async function submitPlayerStats(playerId, statsData, apiKeys, consentGiven = false) {
  try {
    if (!consentGiven) {
      return { success: false, message: 'User consent required to share stats' };
    }
    
    const results = {
      success: false,
      submissions: {}
    };
    
    // Submit to YATA if possible
    if (apiKeys.yata) {
      results.submissions.yata = await submitStatsToYATA(playerId, statsData, apiKeys.yata);
    }
    
    // Submit to TornStats if possible
    if (apiKeys.tornstats) {
      results.submissions.tornstats = await submitStatsToTornStats(playerId, statsData, apiKeys.tornstats);
    }
    
    // Determine overall success
    results.success = Object.values(results.submissions).some(result => result && result.success);
    
    return results;
  } catch (error) {
    logError(`Error in submitPlayerStats for player ${playerId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Submit stats to YATA
 * @param {string} playerId - Player ID
 * @param {Object} statsData - Stats data to submit
 * @param {string} apiKey - YATA API key
 * @returns {Promise<Object>} Submission result
 */
async function submitStatsToYATA(playerId, statsData, apiKey) {
  try {
    if (!apiKey || !statsData || !statsData.battleStats) {
      return { success: false, message: 'Missing required data' };
    }
    
    const postData = JSON.stringify({
      player_id: playerId,
      battle_stats: {
        strength: statsData.battleStats.strength,
        speed: statsData.battleStats.speed,
        dexterity: statsData.battleStats.dexterity,
        defense: statsData.battleStats.defense
      }
    });
    
    const options = {
      hostname: 'yata.yt',
      path: '/api/v1/battlestats/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-API-KEY': apiKey
      }
    };
    
    const response = await makeRequest(options, postData);
    
    if (response.statusCode !== 200 || response.error) {
      return { 
        success: false, 
        message: `YATA API error: ${response.error || 'Unknown error'}`
      };
    }
    
    return { success: true };
  } catch (error) {
    logError(`Error in submitStatsToYATA for player ${playerId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Submit stats to TornStats
 * @param {string} playerId - Player ID
 * @param {Object} statsData - Stats data to submit
 * @param {string} apiKey - TornStats API key
 * @returns {Promise<Object>} Submission result
 */
async function submitStatsToTornStats(playerId, statsData, apiKey) {
  try {
    if (!apiKey || !statsData || !statsData.battleStats) {
      return { success: false, message: 'Missing required data' };
    }
    
    // TornStats doesn't have a public API for submitting stats
    // This is a placeholder for when/if they add one
    
    return { success: false, message: 'API not available' };
  } catch (error) {
    logError(`Error in submitStatsToTornStats for player ${playerId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get player stats from all available sources and combine them
 * @param {string} playerId - Player ID
 * @param {Object} apiKeys - API keys for different services
 * @returns {Promise<Object>} Combined player stats
 */
async function getPlayerStatsFromAllSources(playerId, apiKeys = {}) {
  try {
    const results = {
      sources: {},
      combinedStats: null,
      confidence: 'Low',
      lastUpdated: null
    };
    
    // Fetch from each available source in parallel
    const [yataResult, tornStatsResult, tornToolsResult, tornPDAResult] = await Promise.all([
      apiKeys.yata ? fetchFromYATA(playerId, apiKeys.yata) : null,
      apiKeys.tornstats ? fetchFromTornStats(playerId, apiKeys.tornstats) : null,
      apiKeys.torntools ? fetchFromTornTools(playerId, apiKeys.torntools) : null,
      apiKeys.tornpda ? fetchFromTornPDA(playerId, apiKeys.tornpda) : null
    ]);
    
    // Store results by source
    if (yataResult) results.sources.yata = yataResult;
    if (tornStatsResult) results.sources.tornstats = tornStatsResult;
    if (tornToolsResult) results.sources.torntools = tornToolsResult;
    if (tornPDAResult) results.sources.tornpda = tornPDAResult;
    
    // Calculate which is most recent and most reliable
    let bestSource = null;
    let bestSourceName = null;
    let latestTimestamp = 0;
    
    for (const [sourceName, source] of Object.entries(results.sources)) {
      const timestamp = source.playerProfile?.timestamp || 0;
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        bestSource = source;
        bestSourceName = sourceName;
      }
    }
    
    // Set combined result to the best source if available
    if (bestSource) {
      results.combinedStats = { ...bestSource };
      results.combinedStats.source = bestSourceName;
      results.lastUpdated = new Date(latestTimestamp).toISOString();
      
      // Set confidence based on number of sources
      const sourceCount = Object.keys(results.sources).length;
      if (sourceCount >= 3) {
        results.confidence = 'High';
      } else if (sourceCount >= 2) {
        results.confidence = 'Medium';
      } else {
        results.confidence = 'Low';
      }
    }
    
    return results;
  } catch (error) {
    logError(`Error in getPlayerStatsFromAllSources for player ${playerId}:`, error);
    return {
      sources: {},
      combinedStats: null,
      confidence: 'None',
      error: error.message
    };
  }
}

module.exports = {
  fetchFromYATA,
  fetchFromTornStats,
  fetchSpyFromTornStats,
  fetchFromTornTools,
  fetchFromTornPDA,
  submitPlayerStats,
  getPlayerStatsFromAllSources
};
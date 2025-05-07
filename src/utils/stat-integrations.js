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
      log(`YATA API error for player ${playerId}: ${response.error || 'Unknown error'}`);
      
      // Try public source estimation as a fallback
      log(`Attempting to use public source estimation for player ${playerId}`);
      try {
        const statEstimator = require('./stat-estimator');
        const estimatedStats = await statEstimator.estimateStatsFromPublicSources(playerId);
        
        if (estimatedStats && estimatedStats.battleStats) {
          log(`Successfully estimated stats for player ${playerId} from public sources`);
          return {
            battleStats: estimatedStats.battleStats,
            playerProfile: {
              level: estimatedStats.level || 0,
              age: estimatedStats.age || 0,
              timestamp: Date.now()
            },
            source: 'Public Source Estimation'
          };
        }
      } catch (estimationError) {
        logError(`Error estimating stats from public sources: ${estimationError.message}`);
      }
      
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
    
    // First attempt: Try using the Python adapter (modern approach)
    try {
      const tornstatsBridge = require('./tornstats_bridge');
      const pythonData = await tornstatsBridge.getPlayerDataFromTornStats(playerId, apiKey);
      
      if (pythonData) {
        log(`Successfully fetched data using Python adapter for player ${playerId}`);
        return pythonData;
      }
    } catch (pythonError) {
      logError(`Error using Python adapter: ${pythonError.message}`);
      log(`Falling back to JavaScript implementation for player ${playerId}`);
    }
    
    // Traditional approach with multiple formats as fallback
    // Format 1: /api/v1/{key}/spy/user/{USER_ID}
    let spyResponse = await makeRequest({
      hostname: 'www.tornstats.com',
      path: `/api/v1/${apiKey}/spy/user/${playerId}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BrotherOwlDiscordBot/1.0',
        'Referer': 'https://www.tornstats.com/'
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
        'User-Agent': 'BrotherOwlDiscordBot/1.0',
        'Referer': 'https://www.tornstats.com/'
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
        'User-Agent': 'BrotherOwlDiscordBot/1.0',
        'Referer': 'https://www.tornstats.com/'
      }
    });
    
    log(`TornStats spy API (format 3) response status: ${spyResponse.statusCode}`);
    if (spyResponse.statusCode === 200 && !spyResponse.error && spyResponse.data) {
      log(`Successfully fetched spy data from TornStats for player ${playerId} (format 3)`);
      return spyResponse.data;
    }
    
    // Format 4: Try the official API endpoints
    const officialEndpoints = [
      // Player basic endpoint
      `/api/v1/player/${playerId}`,
      // Player full endpoint
      `/api/v1/player/${playerId}/full`,
      // Battle stats endpoint
      `/api/v1/battles/${playerId}`
    ];
    
    // Try each official endpoint with Bearer token
    for (const endpoint of officialEndpoints) {
      spyResponse = await makeRequest({
        hostname: 'www.tornstats.com',
        path: endpoint,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BrotherOwlDiscordBot/1.0',
          'Referer': 'https://www.tornstats.com/',
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      log(`TornStats official endpoint ${endpoint} response status: ${spyResponse.statusCode}`);
      if (spyResponse.statusCode === 200 && !spyResponse.error && spyResponse.data) {
        log(`Successfully fetched data from TornStats official endpoint ${endpoint} for player ${playerId}`);
        return spyResponse.data;
      }
    }
    
    // Try each official endpoint with API key as query parameter
    for (const endpoint of officialEndpoints) {
      spyResponse = await makeRequest({
        hostname: 'www.tornstats.com',
        path: `${endpoint}?key=${apiKey}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BrotherOwlDiscordBot/1.0',
          'Referer': 'https://www.tornstats.com/'
        }
      });
      
      log(`TornStats official endpoint with key parameter ${endpoint} response status: ${spyResponse.statusCode}`);
      if (spyResponse.statusCode === 200 && !spyResponse.error && spyResponse.data) {
        log(`Successfully fetched data from TornStats official endpoint with key parameter ${endpoint} for player ${playerId}`);
        return spyResponse.data;
      }
    }
    
    // Format 5: Try the web page directly and parse HTML
    log(`Trying to get stats from TornStats web page for player ${playerId}`);
    
    // First try the profiles path
    let htmlResponse = await makeRequest({
      hostname: 'www.tornstats.com',
      path: `/profiles/${playerId}`,
      method: 'GET',
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'BrotherOwlDiscordBot/1.0',
        'Referer': 'https://www.tornstats.com/'
      }
    }, null, true); // Expect HTML here
    
    // If that fails, try the player.php path
    if (htmlResponse.statusCode !== 200 || !htmlResponse.rawHtml) {
      log(`First HTML approach failed, trying alternate URL for player ${playerId}`);
      htmlResponse = await makeRequest({
        hostname: 'www.tornstats.com',
        path: `/player.php?id=${playerId}`,
        method: 'GET',
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'BrotherOwlDiscordBot/1.0',
          'Referer': 'https://www.tornstats.com/'
        }
      }, null, true); // Expect HTML here
    }
    
    // Then try spy.php
    if (htmlResponse.statusCode !== 200 || !htmlResponse.rawHtml) {
      log(`Second HTML approach failed, trying spy URL for player ${playerId}`);
      htmlResponse = await makeRequest({
        hostname: 'www.tornstats.com',
        path: `/spy.php?id=${playerId}`,
        method: 'GET',
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'BrotherOwlDiscordBot/1.0',
          'Referer': 'https://www.tornstats.com/',
          'Cookie': `tornstats_api=${apiKey}`  // Some endpoints accept API key as a cookie
        }
      }, null, true); // Expect HTML here
    }
    
    if (htmlResponse.statusCode === 200 && htmlResponse.rawHtml) {
      log(`Successfully fetched HTML page from TornStats for player ${playerId}`);
      
      // Try to extract battle stats from HTML
      const statsData = extractStatsFromTornStatsHtml(htmlResponse.rawHtml, playerId);
      if (statsData) {
        log(`Successfully extracted stats from TornStats HTML for player ${playerId}`);
        return statsData;
      }
    }
    
    // If all direct API attempts fail, try authentication with cookie
    log(`Trying to access TornStats with authentication for player ${playerId}`);
    try {
      // Get the login page first to get the CSRF token
      const loginPageResponse = await makeRequest({
        hostname: 'www.tornstats.com',
        path: `/login`,
        method: 'GET',
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'BrotherOwlDiscordBot/1.0',
          'Referer': 'https://www.tornstats.com/'
        }
      }, null, true);
      
      // Extract CSRF token
      let csrfToken = null;
      if (loginPageResponse.statusCode === 200 && loginPageResponse.rawHtml) {
        const csrfMatch = loginPageResponse.rawHtml.match(/<input type="hidden" name="_token" value="([^"]+)"/);
        if (csrfMatch && csrfMatch[1]) {
          csrfToken = csrfMatch[1];
        }
      }
      
      // If we got a CSRF token, we could try to login with API key, but that's beyond the scope
      // of this implementation right now. The Python adapter should handle this case better.
      
      log(`Authentication flow attempted but requires traditional email/password login`);
    } catch (error) {
      log(`Error in authentication flow: ${error.message}`);
    }
    
    // Final fallback - use public source estimation
    log(`All TornStats methods failed, falling back to public source estimation`);
    
    // Use the estimator as a fallback
    const statEstimator = require('./stat-estimator');
    const estimatedStats = await statEstimator.estimateStatsFromPublicSources(playerId);
    
    if (estimatedStats && estimatedStats.battleStats) {
      return {
        spy: {
          name: estimatedStats.playerName || `Player ${playerId}`,
          level: estimatedStats.level || 1,
          strength: estimatedStats.battleStats.strength || 0,
          defense: estimatedStats.battleStats.defense || 0,
          speed: estimatedStats.battleStats.speed || 0,
          dexterity: estimatedStats.battleStats.dexterity || 0,
          update_time: new Date().toISOString(),
          source: 'Public Source Estimation (TornStats unavailable)'
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

/**
 * Extract player stats from TornStats HTML page
 * @param {string} html - HTML content from TornStats
 * @param {string} playerId - Player ID for reference
 * @returns {Object|null} Extracted stats data or null
 */
function extractStatsFromTornStatsHtml(html, playerId) {
  try {
    log(`Parsing HTML for player ${playerId}`);
    
    // Basic validation to make sure we have HTML to work with
    if (!html || typeof html !== 'string' || html.length < 100) {
      logError(`Invalid HTML content for player ${playerId}`);
      return null;
    }
    
    // Check if the page contains player stats
    if (!html.includes('Battle Stats') && !html.includes('Last updated')) {
      log(`HTML doesn't appear to contain battle stats for player ${playerId}`);
      return null;
    }
    
    // Try to extract player name
    let playerName = null;
    const nameMatch = html.match(/<title>([^<]+)(?:'s)?\s+Profile(?:\s+|\|)/i);
    if (nameMatch && nameMatch[1]) {
      playerName = nameMatch[1].trim();
    }
    
    // Extract level
    let level = 0;
    const levelMatch = html.match(/Level:\s*(\d+)/i);
    if (levelMatch && levelMatch[1]) {
      level = parseInt(levelMatch[1]);
    }
    
    // Extract last update time
    let updateTime = null;
    const updateMatch = html.match(/Last updated:?\s*([^<]+)/i);
    if (updateMatch && updateMatch[1]) {
      updateTime = updateMatch[1].trim();
    }
    
    // Find the battle stats section
    // Looking for patterns like:
    // <div class="stat">Strength: 12,345,678</div>
    // <td>Strength</td><td>12,345,678</td>
    // Various other possible formats
    
    let strength = 0, defense = 0, speed = 0, dexterity = 0;
    
    // Various regex patterns to try
    const patterns = [
      // Pattern 1: <something>Strength: 12,345,678<something>
      {
        strength: /[Ss]trength:?\s*([\d,]+)/,
        defense: /[Dd]efense:?\s*([\d,]+)/,
        speed: /[Ss]peed:?\s*([\d,]+)/,
        dexterity: /[Dd]exterity:?\s*([\d,]+)/
      },
      // Pattern 2: <td>Strength</td><td>12,345,678</td>
      {
        strength: /<td[^>]*>[Ss]trength<\/td>\s*<td[^>]*>([\d,]+)<\/td>/,
        defense: /<td[^>]*>[Dd]efense<\/td>\s*<td[^>]*>([\d,]+)<\/td>/,
        speed: /<td[^>]*>[Ss]peed<\/td>\s*<td[^>]*>([\d,]+)<\/td>/,
        dexterity: /<td[^>]*>[Dd]exterity<\/td>\s*<td[^>]*>([\d,]+)<\/td>/
      },
      // Pattern 3: class="stat-name">Strength</div><div class="stat-value">12,345,678</div>
      {
        strength: /class="[^"]*stat-name[^"]*"[^>]*>[Ss]trength<\/[^>]+><[^>]+class="[^"]*stat-value[^"]*"[^>]*>([\d,]+)<\//,
        defense: /class="[^"]*stat-name[^"]*"[^>]*>[Dd]efense<\/[^>]+><[^>]+class="[^"]*stat-value[^"]*"[^>]*>([\d,]+)<\//,
        speed: /class="[^"]*stat-name[^"]*"[^>]*>[Ss]peed<\/[^>]+><[^>]+class="[^"]*stat-value[^"]*"[^>]*>([\d,]+)<\//,
        dexterity: /class="[^"]*stat-name[^"]*"[^>]*>[Dd]exterity<\/[^>]+><[^>]+class="[^"]*stat-value[^"]*"[^>]*>([\d,]+)<\//
      }
    ];
    
    // Try each pattern until we find a match
    for (const pattern of patterns) {
      const strengthMatch = html.match(pattern.strength);
      const defenseMatch = html.match(pattern.defense);
      const speedMatch = html.match(pattern.speed);
      const dexterityMatch = html.match(pattern.dexterity);
      
      if (strengthMatch && strengthMatch[1]) {
        strength = parseInt(strengthMatch[1].replace(/,/g, ''));
      }
      
      if (defenseMatch && defenseMatch[1]) {
        defense = parseInt(defenseMatch[1].replace(/,/g, ''));
      }
      
      if (speedMatch && speedMatch[1]) {
        speed = parseInt(speedMatch[1].replace(/,/g, ''));
      }
      
      if (dexterityMatch && dexterityMatch[1]) {
        dexterity = parseInt(dexterityMatch[1].replace(/,/g, ''));
      }
      
      // If we found at least some stats, break
      if (strength > 0 || defense > 0 || speed > 0 || dexterity > 0) {
        break;
      }
    }
    
    // If we couldn't find any stats, return null
    if (strength === 0 && defense === 0 && speed === 0 && dexterity === 0) {
      log(`Could not find any battle stats in HTML for player ${playerId}`);
      return null;
    }
    
    // Log the stats we found
    log(`Extracted stats for ${playerName || playerId}: STR=${strength}, DEF=${defense}, SPD=${speed}, DEX=${dexterity}`);
    
    // Return in same format as API would
    return {
      spy: {
        name: playerName || `Player ${playerId}`,
        level: level || 0,
        strength: strength,
        defense: defense,
        speed: speed,
        dexterity: dexterity,
        update_time: updateTime || new Date().toISOString(),
        source: 'HTML Parsing'
      }
    };
  } catch (error) {
    logError(`Error extracting stats from TornStats HTML for player ${playerId}:`, error);
    return null;
  }
}

module.exports = {
  fetchFromYATA,
  fetchFromTornStats,
  fetchSpyFromTornStats,
  fetchFromTornTools,
  fetchFromTornPDA,
  submitPlayerStats,
  getPlayerStatsFromAllSources,
  extractStatsFromTornStatsHtml
};
/**
 * TornStats Bridge for BrotherOwlManager
 * 
 * This module provides a bridge between Node.js and the Python TornStats adapter.
 * It handles spawning the Python process and parsing the results.
 */

const { spawn } = require('child_process');
const { log, logError } = require('./logger');

/**
 * Get player data from TornStats using the Python adapter
 * @param {string} playerId - The player ID to look up
 * @param {string} apiKey - TornStats API key
 * @returns {Promise<Object|null>} Player data or null on error
 */
async function getPlayerDataFromTornStats(playerId, apiKey) {
  return new Promise((resolve) => {
    try {
      log(`Fetching TornStats data for player ${playerId} using Python adapter`);
      
      // Spawn Python process
      const process = spawn('python', [
        'src/test_tornstats_adapter.py',
        playerId
      ], {
        env: {
          ...process.env,
          TORNSTATS_API_KEY: apiKey
        }
      });
      
      let stdoutData = '';
      let stderrData = '';
      
      // Collect stdout data
      process.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });
      
      // Collect stderr data
      process.stderr.on('data', (data) => {
        stderrData += data.toString();
      });
      
      // Handle process completion
      process.on('close', (code) => {
        if (code !== 0) {
          logError(`Python process exited with code ${code}`);
          logError(`STDERR: ${stderrData}`);
          resolve(null);
          return;
        }
        
        try {
          // Try to parse JSON from the output
          const jsonStartMarker = '✅ Successfully retrieved data for player';
          const jsonEndMarker = 'Player:';
          
          if (stdoutData.includes(jsonStartMarker)) {
            const jsonStart = stdoutData.indexOf('{', stdoutData.indexOf(jsonStartMarker));
            let jsonEnd = stdoutData.indexOf(jsonEndMarker, jsonStart);
            
            if (jsonEnd === -1) {
              jsonEnd = stdoutData.indexOf('\n🔹 TEST SUMMARY', jsonStart);
            }
            
            if (jsonStart !== -1 && jsonEnd !== -1) {
              const jsonStr = stdoutData.substring(jsonStart, jsonEnd).trim();
              try {
                const playerData = JSON.parse(jsonStr);
                log(`Successfully parsed TornStats data for player ${playerId}`);
                resolve(playerData);
                return;
              } catch (parseError) {
                logError(`Error parsing JSON: ${parseError.message}`);
                logError(`JSON string: ${jsonStr}`);
              }
            }
          }
          
          // If we failed to parse JSON, check if there's alternative data
          if (stdoutData.includes('❌ Failed to retrieve data')) {
            log(`Python adapter couldn't retrieve data for player ${playerId}`);
          } else {
            log(`Unknown response from Python adapter: ${stdoutData.substring(0, 200)}...`);
          }
          
          resolve(null);
        } catch (error) {
          logError(`Error processing Python output: ${error.message}`);
          resolve(null);
        }
      });
      
      // Handle process error
      process.on('error', (error) => {
        logError(`Error spawning Python process: ${error.message}`);
        resolve(null);
      });
      
    } catch (error) {
      logError(`Error in TornStats bridge: ${error.message}`);
      resolve(null);
    }
  });
}

/**
 * Convert Python-formatted data to our standard format
 * @param {Object} data - Data from Python adapter
 * @returns {Object} Standardized data format
 */
function normalizePlayerData(data) {
  if (!data || !data.spy) {
    return null;
  }
  
  const spy = data.spy;
  
  return {
    battleStats: {
      strength: spy.strength || 0,
      speed: spy.speed || 0,
      dexterity: spy.dexterity || 0,
      defense: spy.defense || 0,
      total: (spy.strength || 0) + (spy.speed || 0) + 
             (spy.dexterity || 0) + (spy.defense || 0)
    },
    playerProfile: {
      name: spy.name || 'Unknown',
      level: spy.level || 0,
      timestamp: Date.now(),
      source: spy.source || 'TornStats'
    }
  };
}

module.exports = {
  getPlayerDataFromTornStats
};
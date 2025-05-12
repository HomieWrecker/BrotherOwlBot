/**
 * Stats Bridge - Connects JavaScript Discord bot with Python stats estimation
 * 
 * This module provides a bridge between the Node.js Discord bot and the Python stats estimation code.
 * It allows the bot to use the Python-based stats estimation functionality without rewriting everything.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { log, logError } = require('./logger');

/**
 * The path to the Python executable to use
 * This should match the Python version you have installed
 */
const PYTHON_PATH = 'python';

/**
 * The path to the spies.json data file
 */
const SPY_DATA_FILE = path.join('data', 'spies.json');

/**
 * Ensure that the spy data file exists
 */
function ensureSpyFileExists() {
  const dir = path.dirname(SPY_DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (!fs.existsSync(SPY_DATA_FILE)) {
    fs.writeFileSync(SPY_DATA_FILE, '{}');
  }
}

/**
 * Load spy data from the JSON file
 * @returns {Object} The spy data
 */
function loadSpyData() {
  ensureSpyFileExists();
  try {
    const data = fs.readFileSync(SPY_DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logError('Error loading spy data:', error);
    return {};
  }
}

/**
 * Save spy data to the JSON file
 * @param {Object} spyData - The spy data to save
 */
function saveSpyData(spyData) {
  ensureSpyFileExists();
  try {
    fs.writeFileSync(SPY_DATA_FILE, JSON.stringify(spyData, null, 2));
  } catch (error) {
    logError('Error saving spy data:', error);
  }
}

/**
 * Get spy data for a player
 * @param {string} playerId - The player ID to look up
 * @returns {Object|null} The spy data for the player, or null if not found
 */
function getSpyData(playerId) {
  const spyData = loadSpyData();
  return spyData[playerId] || null;
}

/**
 * Add spy data for a player
 * @param {string} playerId - The player ID
 * @param {number} strength - The player's strength
 * @param {number} speed - The player's speed
 * @param {number} dexterity - The player's dexterity
 * @param {number} defense - The player's defense
 * @returns {Object} The added spy data
 */
function addSpyData(playerId, strength, speed, dexterity, defense) {
  const spyData = loadSpyData();
  
  // Add or update the player's stats
  spyData[playerId] = {
    str: parseInt(strength, 10),
    spd: parseInt(speed, 10),
    dex: parseInt(dexterity, 10),
    def: parseInt(defense, 10),
    total: parseInt(strength, 10) + parseInt(speed, 10) + parseInt(dexterity, 10) + parseInt(defense, 10),
    timestamp: new Date().toISOString()
  };
  
  saveSpyData(spyData);
  return spyData[playerId];
}

/**
 * Estimate primary stat based on damage, turns, and your primary stat
 * @param {number} damage - The damage dealt
 * @param {number} turns - The number of turns
 * @param {number} myPrimaryStat - Your primary stat
 * @returns {number} The estimated primary stat
 */
function estimatePrimaryStat(damage, turns, myPrimaryStat) {
  if (turns <= 0 || damage <= 0) {
    return null;
  }
  
  // Use the same formula as in the Python module
  const damagePerTurn = damage / turns;
  const estimatedStat = (myPrimaryStat * 1000) / damagePerTurn;
  
  // Round to nearest thousand for readability
  return Math.floor(estimatedStat / 1000) * 1000;
}

/**
 * Estimate total stats based on primary stat
 * @param {number} primaryStat - The primary stat
 * @returns {number} The estimated total stats
 */
function estimateTotalStats(primaryStat) {
  if (!primaryStat) {
    return null;
  }
  
  // Usually total stats are around 4x primary stat
  return primaryStat * 4;
}

/**
 * Calculate confidence level in the stat data
 * @param {Object} statData - The stat data
 * @returns {string} The confidence level: high, medium, low, or none
 */
function getStatConfidence(statData) {
  if (!statData) {
    return 'none';
  }
  
  // Check if it's from a spy (has all stats)
  if (statData.str !== undefined && statData.spd !== undefined && 
      statData.dex !== undefined && statData.def !== undefined && 
      statData.timestamp) {
    // Calculate days since the spy
    try {
      const spyDate = new Date(statData.timestamp);
      const daysSince = Math.floor((new Date() - spyDate) / (1000 * 60 * 60 * 24));
      
      if (daysSince < 7) {
        return 'high';
      } else if (daysSince < 30) {
        return 'medium';
      } else {
        return 'low';
      }
    } catch (error) {
      return 'medium';
    }
  }
  
  // If it's an estimate
  return 'low';
}

/**
 * Format stat data for display
 * @param {string} playerId - The player ID
 * @param {Object} statData - The stat data
 * @param {string} confidence - The confidence level
 * @returns {string} Formatted stat data
 */
function formatStatsForDisplay(playerId, statData, confidence = 'none') {
  if (!statData) {
    return `No data available for player ${playerId}`;
  }
  
  // Format differently for spy data vs estimates
  if (statData.str !== undefined) {
    // Full spy data
    return {
      title: `Spy Data for Player ${playerId}`,
      fields: [
        { name: 'Strength', value: statData.str.toLocaleString(), inline: true },
        { name: 'Speed', value: statData.spd.toLocaleString(), inline: true },
        { name: 'Dexterity', value: statData.dex.toLocaleString(), inline: true },
        { name: 'Defense', value: statData.def.toLocaleString(), inline: true },
        { name: 'Total', value: statData.total.toLocaleString(), inline: true },
        { name: 'Confidence', value: confidence.charAt(0).toUpperCase() + confidence.slice(1), inline: true }
      ],
      confidence
    };
  } else {
    // Estimate
    return {
      title: `Estimated Stats for Player ${playerId}`,
      fields: [
        { name: 'Estimated Primary', value: (statData.primary || 0).toLocaleString(), inline: true },
        { name: 'Estimated Total', value: (statData.total || 0).toLocaleString(), inline: true },
        { name: 'Confidence', value: confidence.charAt(0).toUpperCase() + confidence.slice(1), inline: true }
      ],
      confidence
    };
  }
}

/**
 * Get a battle recommendation based on stat comparison
 * @param {number} myTotalStats - Your total stats
 * @param {number} enemyTotalStats - Enemy total stats
 * @returns {string} Recommendation: safe, caution, or avoid
 */
function getRecommendation(myTotalStats, enemyTotalStats) {
  if (!enemyTotalStats || !myTotalStats) {
    return 'unknown';
  }
  
  const ratio = myTotalStats / enemyTotalStats;
  
  if (ratio > 1.5) {
    return 'safe';
  } else if (ratio > 0.8) {
    return 'caution';
  } else {
    return 'avoid';
  }
}

/**
 * Get color based on recommendation
 * @param {string} recommendation - The recommendation
 * @returns {number} The color code
 */
function getRecommendationColor(recommendation) {
  switch (recommendation) {
    case 'safe': return 0x00FF00; // Green
    case 'caution': return 0xFFAA00; // Orange
    case 'avoid': return 0xFF0000; // Red
    default: return 0x808080; // Gray
  }
}

/**
 * Get color based on confidence level
 * @param {string} confidence - The confidence level
 * @returns {number} The color code
 */
function getConfidenceColor(confidence) {
  switch (confidence) {
    case 'high': return 0x00FF00; // Green
    case 'medium': return 0xFFAA00; // Orange
    case 'low': return 0xFF6600; // Red-Orange
    default: return 0x808080; // Gray
  }
}

/**
 * Run a Python script and return the result
 * @param {string} scriptPath - The path to the Python script
 * @param {Array} args - Arguments to pass to the script
 * @returns {Promise<Object>} The result of the script
 */
function runPythonScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(PYTHON_PATH, [scriptPath, ...args]);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logError(`Python script exited with code ${code}:`, errorOutput);
        reject(new Error(`Python script exited with code ${code}: ${errorOutput}`));
      } else {
        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (error) {
          logError('Error parsing Python script output:', error);
          reject(new Error(`Error parsing Python script output: ${error.message}`));
        }
      }
    });
  });
}

// Export the functions
module.exports = {
  getSpyData,
  addSpyData,
  estimatePrimaryStat,
  estimateTotalStats,
  getStatConfidence,
  formatStatsForDisplay,
  getRecommendation,
  getRecommendationColor,
  getConfidenceColor,
  runPythonScript
};
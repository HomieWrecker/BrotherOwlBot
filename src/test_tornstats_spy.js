/**
 * Test script for TornStats spy functionality
 * This tests direct access to the TornStats API
 */

const fs = require('fs');
const { log, logError } = require('./utils/logger');
const { formatNumber } = require('./utils/formatting');
const statIntegrations = require('./utils/stat-integrations');

// We need a TornStats API key for this test
const apiKey = process.env.TORNSTATS_API_KEY; // Use the dedicated TornStats API key

if (!apiKey) {
  logError('ERROR: No TornStats API key provided. Set TORNSTATS_API_KEY environment variable.');
  process.exit(1);
}

// Test with public player IDs (Torn's staff or well-known players)
// These IDs should be available in most spy services
const testPlayerIds = ['1', '2', '4']; // Chedburn, Cheddah, Oran

/**
 * Test TornStats spy integration
 * @param {string} playerId - Player ID to test with
 */
async function testTornStatsSpyFunctionality(playerId) {
  try {
    log(`Testing TornStats spy functionality for player ${playerId}`);
    
    // Call the fetchSpyFromTornStats function
    const spyData = await statIntegrations.fetchSpyFromTornStats(playerId, apiKey);
    
    if (!spyData) {
      log(`No data returned from TornStats for player ${playerId}`);
      return;
    }
    
    log('TornStats spy data:');
    console.log(JSON.stringify(spyData, null, 2));
    
    // Check if the data contains relevant information
    // TornStats might return data in different formats, so we need to handle all possibilities
    let stats = null;
    
    if (spyData.spy) {
      // Format: { spy: { ... } }
      stats = spyData.spy;
    } else if (spyData.status && spyData.status === 'ok' && spyData.stats) {
      // Format: { status: 'ok', stats: { ... } }
      stats = spyData.stats;
    } else if (spyData.user) {
      // Format: { user: { ... } }
      stats = spyData.user;
    }
    
    if (stats) {
      log(`Player: ${stats.name || 'Unknown'} [${playerId}]`);
      log(`Level: ${stats.level || 'Unknown'}`);
      
      if (stats.strength && stats.defense && stats.speed && stats.dexterity) {
        const totalStats = stats.strength + stats.defense + stats.speed + stats.dexterity;
        log(`Total stats: ${formatNumber(totalStats)}`);
        log(`Strength: ${formatNumber(stats.strength)}`);
        log(`Defense: ${formatNumber(stats.defense)}`);
        log(`Speed: ${formatNumber(stats.speed)}`);
        log(`Dexterity: ${formatNumber(stats.dexterity)}`);
        log(`Last update: ${stats.update_time || 'Unknown'}`);
      } else {
        log('No battle stats found in the response');
      }
    } else {
      log('Stats data not found in the expected format');
    }
    
    return spyData;
  } catch (error) {
    logError(`Error testing TornStats spy functionality: ${error.message}`);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  log('🔹 STARTING TORNSTATS SPY FUNCTIONALITY TESTS 🔹');
  
  for (const playerId of testPlayerIds) {
    await testTornStatsSpyFunctionality(playerId);
  }
  
  log('🔹 COMPLETED TORNSTATS SPY FUNCTIONALITY TESTS 🔹');
}

// Run the tests
runTests().catch(error => {
  logError(`Test error: ${error.message}`);
});
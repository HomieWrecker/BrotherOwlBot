/**
 * Test script for stat estimation functionality
 * This tests the ability to estimate player stats from public sources
 */

const { log, logError } = require('./utils/logger');
const { formatNumber } = require('./utils/formatting');
const { scrapePlayerProfile } = require('./utils/torn-scraper');
const statEstimator = require('./utils/stat-estimator');

// We need a Torn API key to access some public data
const apiKey = process.env.TORN_API_KEY;

if (!apiKey) {
  logError('ERROR: No Torn API key provided. Set TORN_API_KEY environment variable.');
  process.exit(1);
}

// Test with public player IDs (Torn's staff or well-known players)
// These IDs should be available for public viewing
const testPlayerIds = ['1', '2', '4']; // Chedburn, Cheddah, Oran

/**
 * Test scraping the player profile for data
 * @param {string} playerId - Player ID to test with
 */
async function testProfileScraping(playerId) {
  try {
    log(`Testing profile scraping for player ${playerId}`);
    
    const profileData = await scrapePlayerProfile(playerId);
    
    if (!profileData) {
      log(`No profile data returned for player ${playerId}`);
      return;
    }
    
    log('Profile data:');
    log(`Name: ${profileData.name}`);
    log(`Level: ${profileData.level}`);
    log(`Status: ${profileData.status}`);
    log(`Last Action: ${profileData.lastAction}`);
    log(`Faction: ${profileData.faction.name}`);
    log(`Position: ${profileData.faction.position}`);
    log(`Awards: ${profileData.awards}`);
    log(`Age: ${profileData.age}`);
    
    // Additional data for estimation
    log('Estimation-relevant data:');
    log(`Combat Awards: ${profileData.awards_analysis.combat_awards}`);
    log(`Education Awards: ${profileData.awards_analysis.education_awards}`);
    log(`Battle Indicators: ${JSON.stringify(profileData.battle_indicators)}`);
    log(`Estimated Activity: ${profileData.activity_indicators.estimated_activity}`);
    
    return profileData;
  } catch (error) {
    logError(`Error testing profile scraping: ${error.message}`);
  }
}

/**
 * Test parsing public profile for estimation
 * @param {string} playerId - Player ID to test with
 */
async function testPublicProfileParsing(playerId) {
  try {
    log(`Testing public profile parsing for player ${playerId}`);
    
    const profileData = await statEstimator.parsePublicProfile(playerId);
    
    if (!profileData) {
      log(`No parsed profile data returned for player ${playerId}`);
      return;
    }
    
    log('Parsed profile data for estimation:');
    log(`Level: ${profileData.level}`);
    log(`Basic estimate from profile data:`);
    
    if (profileData.baseEstimate) {
      log(`Strength: ${formatNumber(profileData.baseEstimate.strength)}`);
      log(`Defense: ${formatNumber(profileData.baseEstimate.defense)}`);
      log(`Speed: ${formatNumber(profileData.baseEstimate.speed)}`);
      log(`Dexterity: ${formatNumber(profileData.baseEstimate.dexterity)}`);
      log(`Total: ${formatNumber(profileData.baseEstimate.total)}`);
      log(`Confidence: ${profileData.baseEstimate.confidence}`);
    } else {
      log('No base estimate available');
    }
    
    return profileData;
  } catch (error) {
    logError(`Error testing profile parsing: ${error.message}`);
  }
}

/**
 * Test getting historical battles
 * @param {string} playerId - Player ID to test with
 */
async function testHistoricalBattles(playerId) {
  try {
    log(`Testing historical battles data for player ${playerId}`);
    
    const battleData = await statEstimator.getHistoricalBattles(playerId);
    
    if (!battleData) {
      log(`No battle data returned for player ${playerId}`);
      return;
    }
    
    log('Battle history data:');
    log(`Battles: ${battleData.battles}`);
    log(`Win Rate: ${(battleData.winRate * 100).toFixed(2)}%`);
    log(`Average Damage: ${formatNumber(battleData.averageDamage)}`);
    
    if (battleData.baseEstimate) {
      log('Estimated stats from battle data:');
      log(`Strength: ${formatNumber(battleData.baseEstimate.strength)}`);
      log(`Defense: ${formatNumber(battleData.baseEstimate.defense)}`);
      log(`Speed: ${formatNumber(battleData.baseEstimate.speed)}`);
      log(`Dexterity: ${formatNumber(battleData.baseEstimate.dexterity)}`);
      log(`Total: ${formatNumber(battleData.baseEstimate.total)}`);
      log(`Confidence: ${battleData.baseEstimate.confidence}`);
    } else {
      log('No battle-based estimate available');
    }
    
    return battleData;
  } catch (error) {
    logError(`Error testing historical battles: ${error.message}`);
  }
}

/**
 * Test getting faction averages
 * @param {string} playerId - Player ID to test with
 */
async function testFactionAverages(playerId) {
  try {
    log(`Testing faction averages data for player ${playerId}`);
    
    const factionData = await statEstimator.getFactionAverages(playerId);
    
    if (!factionData) {
      log(`No faction data returned for player ${playerId}`);
      return;
    }
    
    log('Faction data:');
    log(`Faction: ${factionData.factionName}`);
    log(`Members: ${factionData.memberCount}`);
    log(`Average Level: ${factionData.averageLevel}`);
    
    if (factionData.baseEstimate) {
      log('Estimated stats from faction data:');
      log(`Strength: ${formatNumber(factionData.baseEstimate.strength)}`);
      log(`Defense: ${formatNumber(factionData.baseEstimate.defense)}`);
      log(`Speed: ${formatNumber(factionData.baseEstimate.speed)}`);
      log(`Dexterity: ${formatNumber(factionData.baseEstimate.dexterity)}`);
      log(`Total: ${formatNumber(factionData.baseEstimate.total)}`);
      log(`Confidence: ${factionData.baseEstimate.confidence}`);
    } else {
      log('No faction-based estimate available');
    }
    
    return factionData;
  } catch (error) {
    logError(`Error testing faction averages: ${error.message}`);
  }
}

/**
 * Test the full stats estimation process
 * @param {string} playerId - Player ID to test with
 */
async function testFullEstimation(playerId) {
  try {
    log(`Testing full stat estimation for player ${playerId}`);
    
    const estimatedStats = await statEstimator.estimateStatsFromPublicSources(playerId);
    
    if (!estimatedStats) {
      log(`No estimated stats returned for player ${playerId}`);
      return;
    }
    
    log('Full estimation results:');
    log(`Estimation Method: ${estimatedStats.estimationMethod}`);
    log(`Sources Used: ${estimatedStats.sources.join(', ')}`);
    log(`Confidence: ${estimatedStats.confidence}`);
    
    if (estimatedStats.battleStats) {
      log('Estimated Battle Stats:');
      log(`Strength: ${formatNumber(estimatedStats.battleStats.strength)}`);
      log(`Defense: ${formatNumber(estimatedStats.battleStats.defense)}`);
      log(`Speed: ${formatNumber(estimatedStats.battleStats.speed)}`);
      log(`Dexterity: ${formatNumber(estimatedStats.battleStats.dexterity)}`);
      log(`Total: ${formatNumber(estimatedStats.battleStats.total)}`);
    } else {
      log('No battle stats estimate available');
    }
    
    return estimatedStats;
  } catch (error) {
    logError(`Error testing full estimation: ${error.message}`);
  }
}

/**
 * Run all tests for a player
 * @param {string} playerId - Player ID to test with
 */
async function runPlayerTests(playerId) {
  try {
    log(`\n🔹 STARTING TESTS FOR PLAYER ${playerId} 🔹`);
    
    // First test profile scraping
    await testProfileScraping(playerId);
    
    // Then test individual estimation methods
    await testPublicProfileParsing(playerId);
    await testHistoricalBattles(playerId);
    await testFactionAverages(playerId);
    
    // Finally test the combined estimation
    await testFullEstimation(playerId);
    
    log(`\n🔹 COMPLETED TESTS FOR PLAYER ${playerId} 🔹`);
  } catch (error) {
    logError(`Error in player tests: ${error.message}`);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  log('🔹 STARTING STAT ESTIMATOR FUNCTIONALITY TESTS 🔹');
  
  for (const playerId of testPlayerIds) {
    await runPlayerTests(playerId);
  }
  
  log('🔹 COMPLETED STAT ESTIMATOR FUNCTIONALITY TESTS 🔹');
}

// Run the tests
runTests().catch(error => {
  logError(`Test error: ${error.message}`);
});
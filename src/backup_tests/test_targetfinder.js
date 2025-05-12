/**
 * Test script for targetfinder command functionality
 * This tests the core functionality without Discord dependencies
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('./utils/logger');
const { formatNumber } = require('./utils/formatting');
const tornScraper = require('./utils/torn-scraper');
const statIntegrations = require('./utils/stat-integrations');

// We need a real API key to test this functionality
// This should be provided as an environment variable
const apiKey = process.env.TORN_API_KEY;

if (!apiKey) {
  logError('ERROR: No API key provided. Set TORN_API_KEY environment variable.');
  process.exit(1);
}

// Test data - we'll dynamically get a valid ID through lookup
let testPlayerIds = []; // Will be populated after name lookup
const testPlayerNames = ['Chedburn', 'Duke', 'IceBlueFire']; // Torn staff/admins

/**
 * Calculate fair fight modifier
 * @param {number} yourStats - Your total stats
 * @param {number} enemyStats - Enemy total stats
 * @returns {number} Fair fight modifier (0.0 - 5.0)
 */
function calculateFairFight(yourStats, enemyStats) {
  // Simplified fair fight calculation
  // In reality, Torn's algorithm is more complex
  if (yourStats <= 0 || enemyStats <= 0) return 0;
  
  const ratio = enemyStats / yourStats;
  
  if (ratio <= 0.25) return 1.0;  // Much weaker enemy
  if (ratio <= 0.5) return 1.5;   // Weaker enemy
  if (ratio <= 0.75) return 2.0;  // Slightly weaker enemy
  if (ratio <= 1.0) return 3.0;   // Equal enemy
  if (ratio <= 1.25) return 3.5;  // Slightly stronger enemy
  if (ratio <= 1.5) return 4.0;   // Stronger enemy
  return 5.0;                     // Much stronger enemy
}

/**
 * Calculate respect gain
 * @param {Object} player - Player data
 * @param {number} fairFight - Fair fight modifier
 * @returns {number} Estimated respect gain
 */
function calculateRespect(player, fairFight) {
  // Simplified respect calculation
  // In reality, Torn's algorithm is more complex
  const baseRespect = (player.level * 0.25) || 1;
  return baseRespect * fairFight;
}

/**
 * Fetch player data from Torn API
 * @param {string} playerId - Player ID to fetch
 */
async function fetchPlayerData(playerId) {
  try {
    log(`Fetching player data for ID: ${playerId}`);
    
    // API endpoint for player data
    const url = `https://api.torn.com/user/${playerId}?selections=profile,personalstats,battlestats&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      logError(`API Error: ${data.error.error}`);
      return null;
    }
    
    return data;
  } catch (error) {
    logError(`Error fetching player data: ${error.message}`);
    return null;
  }
}

/**
 * Test player lookup by name
 * @param {string} name - Player name to look up
 */
async function lookupPlayerByName(name) {
  try {
    log(`Looking up player by name: ${name}`);
    
    // API endpoint for player lookup
    const url = `https://api.torn.com/user/?selections=lookup&lookup=${encodeURIComponent(name)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      logError(`API Error: ${data.error.error}`);
      return null;
    }
    
    if (data.user && data.user.length > 0) {
      log(`Found player: ${data.user[0].name} [${data.user[0].player_id}]`);
      return data.user[0].player_id.toString();
    }
    
    log(`No player found with name ${name}`);
    return null;
  } catch (error) {
    logError(`Error looking up player: ${error.message}`);
    return null;
  }
}

/**
 * Test finding targets based on criteria
 * @param {Object} userData - User's own data from API
 * @param {Object} options - Search options
 */
async function testFindTargets(userData, options = {}) {
  try {
    log('Testing target finder with the following criteria:');
    console.log(options);
    
    // Default options
    options = {
      minLevel: 1,
      maxLevel: userData.level * 1.5,
      minRespect: 1,
      minFairFight: 2.0,
      maxFairFight: 5.0,
      online: true,
      limit: 5,
      ...options
    };
    
    log('Fetching potential targets...');
    
    // In a real implementation, we would search through a list of potential targets
    // For this test, we'll just check the provided test player IDs
    const results = [];
    
    for (const targetId of testPlayerIds) {
      // Skip if target is the user
      if (targetId === userData.player_id) continue;
      
      const targetData = await fetchPlayerData(targetId);
      if (!targetData) continue;
      
      // Calculate total stats
      let targetTotalStats = 0;
      if (targetData.battlestats) {
        targetTotalStats = Object.values(targetData.battlestats).reduce((a, b) => a + b, 0);
      }
      
      let userTotalStats = 0;
      if (userData.battlestats) {
        userTotalStats = Object.values(userData.battlestats).reduce((a, b) => a + b, 0);
      }
      
      // Check level criteria
      if (targetData.level < options.minLevel || targetData.level > options.maxLevel) {
        log(`Target ${targetData.name} [${targetId}] doesn't meet level criteria`);
        continue;
      }
      
      // Check online status if required
      if (options.online && targetData.last_action.status !== 'Online') {
        log(`Target ${targetData.name} [${targetId}] is not online`);
        continue;
      }
      
      // Calculate fair fight and respect
      const fairFight = calculateFairFight(userTotalStats, targetTotalStats);
      const respect = calculateRespect(targetData, fairFight);
      
      // Check fair fight criteria
      if (fairFight < options.minFairFight || fairFight > options.maxFairFight) {
        log(`Target ${targetData.name} [${targetId}] doesn't meet fair fight criteria (${fairFight.toFixed(2)})`);
        continue;
      }
      
      // Check respect criteria
      if (respect < options.minRespect) {
        log(`Target ${targetData.name} [${targetId}] doesn't meet respect criteria (${respect.toFixed(2)})`);
        continue;
      }
      
      // Add to results
      results.push({
        id: targetId,
        name: targetData.name,
        level: targetData.level,
        totalStats: targetTotalStats,
        fairFight,
        respect,
        lastAction: targetData.last_action.relative,
        status: targetData.last_action.status,
        faction: targetData.faction?.faction_name || 'None'
      });
      
      log(`Found potential target: ${targetData.name} [${targetId}]`);
    }
    
    // Sort by respect (highest first)
    results.sort((a, b) => b.respect - a.respect);
    
    // Limit results
    const limitedResults = results.slice(0, options.limit);
    
    log(`Found ${limitedResults.length} targets matching criteria:`);
    console.table(limitedResults);
    
    return limitedResults;
  } catch (error) {
    logError(`Error finding targets: ${error.message}`);
    return [];
  }
}

/**
 * Test fetching user's own data first
 */
async function testTargetFinderWithOwnData(userId) {
  try {
    log(`Testing target finder with user ID: ${userId}`);
    
    // Fetch user's own data first
    const userData = await fetchPlayerData(userId);
    if (!userData) {
      logError('Could not fetch user data.');
      return;
    }
    
    log(`User: ${userData.name} [${userData.player_id}], Level: ${userData.level}`);
    
    // Calculate total stats
    let userTotalStats = 0;
    if (userData.battlestats) {
      userTotalStats = Object.values(userData.battlestats).reduce((a, b) => a + b, 0);
    }
    log(`User's total battle stats: ${formatNumber(userTotalStats)}`);
    
    // Run target finder tests with different criteria
    
    // Test 1: Basic search
    await testFindTargets(userData, {
      minLevel: 1,
      maxLevel: userData.level * 1.5,
      minRespect: 1,
      online: false
    });
    
    // Test 2: Higher respect targets
    await testFindTargets(userData, {
      minLevel: userData.level * 0.8,
      maxLevel: userData.level * 1.2,
      minRespect: 2,
      online: false
    });
    
    // Test 3: Online targets only
    await testFindTargets(userData, {
      minLevel: 1,
      maxLevel: userData.level * 2,
      minRespect: 1,
      online: true
    });
    
  } catch (error) {
    logError(`Error in targetfinder test: ${error.message}`);
  }
}

/**
 * Test getting faction targets
 */
async function testFactionTargets(userId) {
  try {
    log('Testing faction target finder');
    
    // Fetch user's own data first
    const userData = await fetchPlayerData(userId);
    if (!userData) {
      logError('Could not fetch user data.');
      return;
    }
    
    // Get user's faction ID
    const factionId = userData.faction?.faction_id;
    if (!factionId) {
      log('User is not in a faction.');
      return;
    }
    
    log(`User's faction: ${userData.faction.faction_name} [${factionId}]`);
    
    // In a real implementation, we would get enemy faction IDs
    // For this test, we'll just use a simulated enemy faction
    log('Simulating enemy faction targets...');
    
    // This would be replaced with actual enemy factions from wars or other data
    const enemyFactionIds = ['faction1', 'faction2'];
    
    log(`Would search for targets in enemy factions: ${enemyFactionIds.join(', ')}`);
    log('This would require additional API calls to faction endpoints or faction wars endpoints.');
    
  } catch (error) {
    logError(`Error in faction targets test: ${error.message}`);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  log('🔹 STARTING TARGETFINDER COMMAND FUNCTIONALITY TESTS 🔹');
  
  // First, get valid player IDs by looking up names
  log('Looking up valid player IDs...');
  for (const name of testPlayerNames) {
    const playerId = await lookupPlayerByName(name);
    if (playerId) {
      testPlayerIds.push(playerId);
    }
  }
  
  if (testPlayerIds.length === 0) {
    logError('Could not find any valid player IDs. Tests cannot continue.');
    return;
  }
  
  log(`Using player IDs for tests: ${testPlayerIds.join(', ')}`);
  
  // Use first valid ID as our test user
  const testUserId = testPlayerIds[0];
  
  // Test target finder with user's own data
  await testTargetFinderWithOwnData(testUserId);
  
  // Test faction targets
  await testFactionTargets(testUserId);
  
  log('🔹 COMPLETED TARGETFINDER COMMAND FUNCTIONALITY TESTS 🔹');
}

// Run the tests
runTests().catch(error => {
  logError(`Test error: ${error.message}`);
});
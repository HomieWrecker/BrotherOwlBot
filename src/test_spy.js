/**
 * Test script for spy command functionality
 * This tests the core functionality without Discord dependencies
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('./utils/logger');
const { formatNumber } = require('./utils/formatting');
const tornScraper = require('./utils/torn-scraper');
const statIntegrations = require('./utils/stat-integrations');

// Test data
const testPlayerIds = ['3010289', '3243373'];
const testPlayerName = 'Snag';

// We need a real API key to test this functionality
// This should be provided as an environment variable
const apiKey = process.env.TORN_API_KEY;

if (!apiKey) {
  logError('ERROR: No API key provided. Set TORN_API_KEY environment variable.');
  process.exit(1);
}

/**
 * Test fetching basic player data from Torn API
 * @param {string} playerId - Player ID to fetch
 */
async function testFetchPlayerData(playerId) {
  try {
    log(`Testing player data fetch for ID: ${playerId}`);
    
    // API endpoint for player data
    const url = `https://api.torn.com/user/${playerId}?selections=profile,personalstats,battlestats&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      logError(`API Error: ${data.error.error}`);
      return;
    }
    
    log('Successfully fetched player data:');
    log(`Name: ${data.name} [${data.player_id}]`);
    log(`Level: ${data.level}`);
    log(`Last Action: ${data.last_action.relative}`);
    
    if (data.battlestats) {
      const total = Object.values(data.battlestats).reduce((a, b) => a + b, 0);
      log(`Total Battle Stats: ${formatNumber(total)}`);
    }
    
    return data;
  } catch (error) {
    logError(`Error fetching player data: ${error.message}`);
  }
}

/**
 * Test player lookup by name
 * @param {string} name - Player name to look up
 */
async function testPlayerLookupByName(name) {
  try {
    log(`Testing player lookup by name: ${name}`);
    
    // API endpoint for player lookup
    const url = `https://api.torn.com/user/?selections=lookup&lookup=${encodeURIComponent(name)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      logError(`API Error: ${data.error.error}`);
      return;
    }
    
    log('Successfully looked up player:');
    console.log(data);
    
    return data;
  } catch (error) {
    logError(`Error looking up player: ${error.message}`);
  }
}

/**
 * Test scraping player profile page for public data
 * @param {string} playerId - Player ID to scrape
 */
async function testScrapePlayerProfile(playerId) {
  try {
    log(`Testing profile scraping for ID: ${playerId}`);
    
    const profileData = await tornScraper.scrapePlayerProfile(playerId);
    
    log('Successfully scraped player profile:');
    console.log(profileData);
    
    return profileData;
  } catch (error) {
    logError(`Error scraping player profile: ${error.message}`);
  }
}

/**
 * Test gathering player data from multiple sources
 * @param {string} playerId - Player ID to gather data for
 */
async function testGatherPlayerIntel(playerId) {
  try {
    log(`Gathering intelligence for player: ${playerId}`);
    
    // Get data from Torn API
    const tornData = await testFetchPlayerData(playerId);
    if (!tornData) return;
    
    // Get scraped profile data (public information)
    const scrapedData = await testScrapePlayerProfile(playerId);
    
    // Attempt to get data from other services
    let additionalData = {};
    try {
      // This would connect to other stat services
      // For now we'll just simulate this
      log('Simulating connections to third-party services...');
      // In a real implementation, we'd use the statIntegrations module
    } catch (error) {
      logError(`Error getting additional data: ${error.message}`);
    }
    
    // Combine data from all sources
    const combinedData = {
      ...tornData,
      scraped: scrapedData || {},
      thirdParty: additionalData || {}
    };
    
    log('Complete intelligence profile assembled:');
    // In a real command, we'd format this into a Discord embed
    
    // Output key information
    log(`Player: ${combinedData.name} [${combinedData.player_id}]`);
    log(`Faction: ${combinedData.faction?.faction_name || 'Unknown'}`);
    log(`Level: ${combinedData.level}`);
    log(`Last Action: ${combinedData.last_action?.relative || 'Unknown'}`);
    
    if (combinedData.battlestats) {
      const total = Object.values(combinedData.battlestats).reduce((a, b) => a + b, 0);
      log(`Total Battle Stats: ${formatNumber(total)}`);
    }
    
    return combinedData;
  } catch (error) {
    logError(`Error gathering player intel: ${error.message}`);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  log('🔹 STARTING SPY COMMAND FUNCTIONALITY TESTS 🔹');
  
  // Test basic data fetching with different IDs
  for (const playerId of testPlayerIds) {
    await testFetchPlayerData(playerId);
  }
  
  // Test player lookup by name
  await testPlayerLookupByName(testPlayerName);
  
  // Test profile scraping
  for (const playerId of testPlayerIds) {
    await testScrapePlayerProfile(playerId);
  }
  
  // Test full intelligence gathering
  for (const playerId of testPlayerIds) {
    await testGatherPlayerIntel(playerId);
  }
  
  log('🔹 COMPLETED SPY COMMAND FUNCTIONALITY TESTS 🔹');
}

// Run the tests
runTests().catch(error => {
  logError(`Test error: ${error.message}`);
});
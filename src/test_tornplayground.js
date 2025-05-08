/**
 * Test script for TornAPI Playground integration
 * This tests the integration with the TornAPI Playground service (https://tornapi.tornplayground.eu/)
 */

const { SERVICES, fetchFromService, getPlayerData, getFactionData } = require('./services/integrations');
const { log, logError } = require('./utils/logger');

// Main testing function
async function testTornPlaygroundIntegration() {
  // Set up
  log('Starting TornAPI Playground integration test');
  const apiKey = process.env.TORN_API_KEY;
  
  if (!apiKey) {
    logError('No Torn API key found in environment variables');
    return;
  }
  
  // Test service availability - direct ping instead of using checkServiceAvailability
  log('\n1. Testing service availability...');
  try {
    // Try a direct ping to the API endpoint
    const response = await fetch('https://tornapi.tornplayground.eu/api/v2/');
    
    if (response.ok) {
      log('TornAPI Playground service is available');
    } else {
      log(`TornAPI Playground service returned status ${response.status}`);
      // Even if the ping fails, we'll continue with the tests
    }
  } catch (error) {
    logError(`Error pinging TornAPI Playground: ${error.message}`);
    // Even if the ping fails, we'll continue with the tests
  }
  
  // Test player data retrieval
  log('\n2. Testing direct API call...');
  try {
    // Try a direct API call to verify URL format
    const url = `https://tornapi.tornplayground.eu/api/v2/user?key=${apiKey}`;
    log(`Testing direct URL: ${url.replace(apiKey, '****')}`);
    
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      log(`Direct API call successful! User: ${data.name || 'Unknown'} [${data.player_id || 'Unknown ID'}]`);
    } else {
      log(`Direct API call failed with status: ${response.status}`);
      const text = await response.text();
      log(`Response: ${text.slice(0, 100)}...`);
    }
  } catch (error) {
    logError(`Error with direct API call: ${error.message}`);
  }
  
  log('\n3. Testing player data retrieval (self) via integration...');
  try {
    const playerData = await getPlayerData(SERVICES.TORNPLAYGROUND, apiKey);
    
    if (playerData.error) {
      logError('Error fetching player data:', playerData.error);
    } else {
      log(`Successfully retrieved player data for: ${playerData.name || 'Unknown'} [${playerData.player_id || 'Unknown ID'}]`);
      log(`Level: ${playerData.level || 'Unknown'}`);
      
      // Check if battle stats are available
      if (playerData.strength || playerData.speed || playerData.dexterity || playerData.defense) {
        log('Battle stats retrieved successfully');
      } else {
        log('Battle stats not available in response');
      }
    }
  } catch (error) {
    logError('Exception while fetching player data:', error);
  }
  
  // Test faction data retrieval
  log('\n4. Testing faction data retrieval...');
  try {
    const factionData = await getFactionData(SERVICES.TORNPLAYGROUND, apiKey);
    
    if (factionData.error) {
      logError('Error fetching faction data:', factionData.error);
    } else {
      log(`Successfully retrieved faction data for: ${factionData.name || 'Unknown'} [${factionData.ID || 'Unknown ID'}]`);
      log(`Member count: ${factionData.members ? Object.keys(factionData.members).length : 'Unknown'}`);
    }
  } catch (error) {
    logError('Exception while fetching faction data:', error);
  }
  
  log('\nTornAPI Playground integration test complete');
}

// Run the test
testTornPlaygroundIntegration().catch(error => {
  logError('Unhandled error in test:', error);
});
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
    const response = await fetch('https://tornapi.tornplayground.eu/');
    
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
  
  // Try alternate URL patterns that might be used
  log('\n1b. Testing alternate base URL patterns...');
  
  const alternateUrls = [
    'https://tornapi.tornplayground.eu/api',
    'https://tornapi.tornplayground.eu/v2',
    'https://tornplayground.eu/api',
    'https://api.tornplayground.eu'
  ];
  
  for (const url of alternateUrls) {
    try {
      log(`Testing URL: ${url}`);
      const response = await fetch(url);
      log(`Response status: ${response.status}`);
      
      // If we get a 200 response, let's check the content type
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        log(`Content type: ${contentType}`);
        
        // If it's JSON, we might have found the right endpoint
        if (contentType && contentType.includes('application/json')) {
          log(`Found potential API endpoint: ${url}`);
        }
      }
    } catch (error) {
      log(`Error testing ${url}: ${error.message}`);
    }
  }
  
  // Test player data retrieval with different API path formats
  log('\n2. Testing direct API calls with different path formats...');
  
  // Let's try different API paths to see which one might work
  const apiPaths = [
    // Current implementation
    `https://tornapi.tornplayground.eu/api/v2/user?key=${apiKey}`,
    
    // Alternative formats to try
    `https://tornapi.tornplayground.eu/api/v2/user?apikey=${apiKey}`,
    `https://tornapi.tornplayground.eu/api/user?key=${apiKey}`,
    `https://tornapi.tornplayground.eu/v2/user?key=${apiKey}`,
    `https://tornapi.tornplayground.eu/user?key=${apiKey}`,
    
    // Torn-like format
    `https://tornapi.tornplayground.eu/user/?key=${apiKey}`,
    
    // TornStats-like format (key as part of path)
    `https://tornapi.tornplayground.eu/api/v2/${apiKey}/user`,
    
    // Try with selections parameter variations
    `https://tornapi.tornplayground.eu/api/v2/user?key=${apiKey}&select=profile,stats`,
    `https://tornapi.tornplayground.eu/api/v2/user?key=${apiKey}&selections=profile,stats`
  ];
  
  for (const url of apiPaths) {
    try {
      // Mask API key for logs
      const maskedUrl = url.replace(apiKey, '****');
      log(`Testing URL: ${maskedUrl}`);
      
      const response = await fetch(url);
      log(`Response status: ${response.status}`);
      
      if (response.ok) {
        try {
          const data = await response.json();
          log(`✓ Success! Format looks valid. Found data for: ${data.name || 'Unknown'}`);
          
          // If we succeeded, save this URL pattern for later use
          log(`Found working API endpoint pattern: ${maskedUrl}`);
          break;
        } catch (e) {
          log(`Response wasn't valid JSON: ${e.message}`);
        }
      } else {
        const text = await response.text();
        log(`Response first 100 chars: ${text.slice(0, 100)}...`);
      }
    } catch (error) {
      log(`Error with ${url.replace(apiKey, '****')}: ${error.message}`);
    }
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
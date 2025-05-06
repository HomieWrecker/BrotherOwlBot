/**
 * External service integrations for BrotherOwlManager
 * Handles connections to various Torn-related services
 */

const { log, logError } = require('../utils/logger');

/**
 * Available service integrations
 */
const SERVICES = {
  TORN: 'torn',
  YATA: 'yata',
  ANARCHY: 'anarchy',
  TORNSTATS: 'tornstats',
  TORNTOOLS: 'torntools'
};

/**
 * Fetch data from a specific service
 * @param {string} service - Service identifier
 * @param {string} endpoint - API endpoint
 * @param {string} apiKey - API key to use
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Data from the service
 */
async function fetchFromService(service, endpoint, apiKey, options = {}) {
  const url = buildServiceUrl(service, endpoint, apiKey, options);
  
  try {
    log(`Fetching data from ${service} (${endpoint})`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check for API errors in response
    if (data.error) {
      logError(`${service} API error:`, data.error);
      return { error: data.error };
    }
    
    return data;
  } catch (error) {
    logError(`Error fetching data from ${service}:`, error);
    return { error: `Failed to fetch data from ${service}: ${error.message}` };
  }
}

/**
 * Build a service URL
 * @param {string} service - Service identifier
 * @param {string} endpoint - API endpoint
 * @param {string} apiKey - API key
 * @param {Object} options - Additional URL options
 * @returns {string} Complete URL
 */
function buildServiceUrl(service, endpoint, apiKey, options = {}) {
  switch (service) {
    case SERVICES.YATA:
      return `https://yata.yt/api/v1/${endpoint}/?key=${apiKey}`;
    
    case SERVICES.ANARCHY:
      return `https://anarchy.torn.com/api/v1/${endpoint}/?key=${apiKey}`;
    
    case SERVICES.TORNSTATS:
      return `https://www.tornstats.com/api/v1/${apiKey}/${endpoint}`;
    
    case SERVICES.TORNTOOLS:
      return `https://torntools.com/api/v1/${endpoint}/?key=${apiKey}`;
    
    case SERVICES.TORN:
    default:
      const selections = options.selections ? `&selections=${options.selections}` : '';
      return `https://api.torn.com/${endpoint}/?key=${apiKey}${selections}`;
  }
}

/**
 * Check if a service is available
 * @param {string} service - Service identifier
 * @returns {Promise<boolean>} Whether the service is available
 */
async function checkServiceAvailability(service) {
  try {
    // Simple ping to check if the service is up
    const urls = {
      [SERVICES.TORN]: 'https://api.torn.com/',
      [SERVICES.YATA]: 'https://yata.yt/',
      [SERVICES.ANARCHY]: 'https://anarchy.torn.com/',
      [SERVICES.TORNSTATS]: 'https://www.tornstats.com/',
      [SERVICES.TORNTOOLS]: 'https://torntools.com/'
    };
    
    const url = urls[service];
    if (!url) return false;
    
    const response = await fetch(url, { 
      method: 'HEAD',
      timeout: 3000 // 3 second timeout
    });
    
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Get player data from a specific service
 * @param {string} service - Service identifier
 * @param {string} apiKey - API key
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Player data
 */
async function getPlayerData(service, apiKey, options = {}) {
  switch (service) {
    case SERVICES.YATA:
      return fetchFromService(service, 'user', apiKey);
    
    case SERVICES.ANARCHY:
      return fetchFromService(service, 'user', apiKey);
    
    case SERVICES.TORNSTATS:
      return fetchFromService(service, 'stats', apiKey);
    
    case SERVICES.TORNTOOLS:
      return fetchFromService(service, 'user', apiKey);
    
    case SERVICES.TORN:
    default:
      return fetchFromService(
        service, 
        'user', 
        apiKey, 
        { selections: options.selections || 'profile,personalstats,battlestats' }
      );
  }
}

/**
 * Get faction data from a specific service
 * @param {string} service - Service identifier
 * @param {string} apiKey - API key
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Faction data
 */
async function getFactionData(service, apiKey, options = {}) {
  const factionId = options.factionId || '';
  
  switch (service) {
    case SERVICES.YATA:
      return fetchFromService(service, `faction/${factionId}`, apiKey);
    
    case SERVICES.ANARCHY:
      return fetchFromService(service, `faction/${factionId}`, apiKey);
    
    case SERVICES.TORNSTATS:
      return fetchFromService(service, 'faction', apiKey);
    
    case SERVICES.TORN:
    default:
      return fetchFromService(
        service, 
        'faction', 
        apiKey, 
        { selections: options.selections || 'basic,stats' }
      );
  }
}

// Export the services
module.exports = {
  SERVICES,
  fetchFromService,
  checkServiceAvailability,
  getPlayerData,
  getFactionData
};
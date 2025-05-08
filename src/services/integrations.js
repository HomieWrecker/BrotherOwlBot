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
  TORNTOOLS: 'torntools',
  TORNPLAYGROUND: 'tornplayground'
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
      
    case SERVICES.TORNPLAYGROUND:
      const playgroundSelections = options.selections ? `&selections=${options.selections}` : '';
      return `https://tornapi.tornplayground.eu/api/v2/${endpoint}?key=${apiKey}${playgroundSelections}`;
    
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
      [SERVICES.TORNTOOLS]: 'https://torntools.com/',
      [SERVICES.TORNPLAYGROUND]: 'https://tornapi.tornplayground.eu/api/v2/'
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
  const playerId = options.playerId || '';
  
  // First check if the service is available - for optional services
  if (service !== SERVICES.TORN && options.checkAvailability !== false) {
    const isAvailable = await checkServiceAvailability(service);
    if (!isAvailable) {
      return { 
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `The ${service} service is currently unavailable.`
        },
        service_status: 'unavailable'
      };
    }
  }
  
  try {
    switch (service) {
      case SERVICES.YATA:
        return fetchFromService(service, 'user', apiKey);
      
      case SERVICES.ANARCHY:
        return fetchFromService(service, 'user', apiKey);
      
      case SERVICES.TORNSTATS:
        return fetchFromService(service, 'stats', apiKey);
      
      case SERVICES.TORNTOOLS:
        return fetchFromService(service, 'user', apiKey);
        
      case SERVICES.TORNPLAYGROUND:
        // For specific player lookup
        if (playerId) {
          return fetchFromService(
            service,
            `user/${playerId}`,
            apiKey,
            { selections: options.selections || 'profile,personalstats,battlestats' }
          );
        }
        // For self lookup
        return fetchFromService(
          service,
          'user/',
          apiKey,
          { selections: options.selections || 'profile,personalstats,battlestats' }
        );
      
      case SERVICES.TORN:
      default:
        // For specific player lookup 
        if (playerId) {
          return fetchFromService(
            service,
            `user/${playerId}`,
            apiKey,
            { selections: options.selections || 'profile,personalstats,battlestats' }
          );
        }
        // For self lookup
        return fetchFromService(
          service, 
          'user', 
          apiKey, 
          { selections: options.selections || 'profile,personalstats,battlestats' }
        );
    }
  } catch (error) {
    log(`Error in getPlayerData for ${service}: ${error.message}`);
    return { 
      error: { 
        code: 'SERVICE_ERROR', 
        message: error.message 
      },
      service_status: 'error'
    };
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
  
  // First check if the service is available - for optional services
  if (service !== SERVICES.TORN && options.checkAvailability !== false) {
    const isAvailable = await checkServiceAvailability(service);
    if (!isAvailable) {
      return { 
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `The ${service} service is currently unavailable.`
        },
        service_status: 'unavailable'
      };
    }
  }
  
  try {
    switch (service) {
      case SERVICES.YATA:
        return fetchFromService(service, `faction/${factionId}`, apiKey);
      
      case SERVICES.ANARCHY:
        return fetchFromService(service, `faction/${factionId}`, apiKey);
      
      case SERVICES.TORNSTATS:
        return fetchFromService(service, 'faction', apiKey);
        
      case SERVICES.TORNPLAYGROUND:
        // For specific faction lookup
        if (factionId) {
          return fetchFromService(
            service,
            `faction/${factionId}`,
            apiKey,
            { selections: options.selections || 'basic,stats' }
          );
        }
        // For user's faction lookup
        return fetchFromService(
          service,
          'faction',
          apiKey,
          { selections: options.selections || 'basic,stats' }
        );
      
      case SERVICES.TORN:
      default:
        // For specific faction lookup
        if (factionId) {
          return fetchFromService(
            service, 
            `faction/${factionId}`, 
            apiKey, 
            { selections: options.selections || 'basic,stats' }
          );
        }
        // For user's faction lookup
        return fetchFromService(
          service, 
          'faction', 
          apiKey, 
          { selections: options.selections || 'basic,stats' }
        );
    }
  } catch (error) {
    log(`Error in getFactionData for ${service}: ${error.message}`);
    return { 
      error: { 
        code: 'SERVICE_ERROR', 
        message: error.message 
      },
      service_status: 'error'
    };
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
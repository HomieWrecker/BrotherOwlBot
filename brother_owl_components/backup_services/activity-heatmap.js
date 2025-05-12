/**
 * Activity Heat Map Service for BrotherOwlManager
 * Tracks and visualizes faction member activity patterns over time
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');
const { formatNumber, formatTime } = require('../utils/formatting');
const { getUserApiKey } = require('../commands/apikey');
const https = require('https');

// Data file path
const ACTIVITY_DATA_FILE = path.join(__dirname, '../../data/activity_heatmap.json');

// Initialize data structure
let activityData = {
  lastUpdate: null,
  members: {},
  hourlyActivity: {}
};

/**
 * Load activity data from file
 */
function loadActivityData() {
  try {
    if (fs.existsSync(ACTIVITY_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACTIVITY_DATA_FILE, 'utf8'));
      activityData = data;
      log('Activity heat map data loaded');
    } else {
      saveActivityData(); // Create the file if it doesn't exist
      log('New activity heat map data file created');
    }
  } catch (error) {
    logError('Error loading activity heat map data:', error);
  }
}

/**
 * Save activity data to file
 */
function saveActivityData() {
  try {
    fs.writeFileSync(ACTIVITY_DATA_FILE, JSON.stringify(activityData, null, 2));
  } catch (error) {
    logError('Error saving activity heat map data:', error);
  }
}

/**
 * Fetch faction member data from Torn API and update activity records
 * @param {string} apiKey - Torn API key
 * @param {string} factionId - Optional specific faction ID
 * @returns {Promise<Object>} Updated activity data
 */
async function updateActivityData(apiKey, factionId = null) {
  return new Promise((resolve, reject) => {
    // If no faction ID is provided, get it from the API key
    const endpoint = factionId 
      ? `/faction/${factionId}?selections=basic,members&key=${apiKey}`
      : `/user/?selections=basic,faction&key=${apiKey}`;
    
    const options = {
      hostname: 'api.torn.com',
      path: endpoint,
      method: 'GET'
    };
    
    const req = https.request(options, res => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', async () => {
        try {
          const response = JSON.parse(data);
          
          if (response.error) {
            reject(new Error(`Torn API error: ${response.error.error}`));
            return;
          }
          
          // If no faction ID was provided, get it from the response
          const actualFactionId = factionId || (response.faction ? response.faction.faction_id : null);
          
          if (!actualFactionId) {
            reject(new Error('No faction ID found'));
            return;
          }
          
          // Now fetch the faction data if we didn't already get it
          if (!factionId) {
            const factionData = await fetchFactionData(apiKey, actualFactionId);
            processFactionData(factionData);
            resolve(activityData);
          } else {
            processFactionData(response);
            resolve(activityData);
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', error => {
      reject(error);
    });
    
    req.end();
  });
}

/**
 * Fetch faction data from Torn API
 * @param {string} apiKey - Torn API key
 * @param {string} factionId - Faction ID
 * @returns {Promise<Object>} Faction data
 */
async function fetchFactionData(apiKey, factionId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.torn.com',
      path: `/faction/${factionId}?selections=basic,members&key=${apiKey}`,
      method: 'GET'
    };
    
    const req = https.request(options, res => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (response.error) {
            reject(new Error(`Torn API error: ${response.error.error}`));
            return;
          }
          
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', error => {
      reject(error);
    });
    
    req.end();
  });
}

/**
 * Process faction data and update activity records
 * @param {Object} factionData - Faction data from Torn API
 */
function processFactionData(factionData) {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Create hour/day key if it doesn't exist
  if (!activityData.hourlyActivity[day]) {
    activityData.hourlyActivity[day] = {};
  }
  
  if (!activityData.hourlyActivity[day][hour]) {
    activityData.hourlyActivity[day][hour] = {
      activeMembers: 0,
      totalMembers: 0,
      activeIds: []
    };
  }
  
  const hourData = activityData.hourlyActivity[day][hour];
  hourData.totalMembers = Object.keys(factionData.members).length;
  hourData.activeMembers = 0;
  hourData.activeIds = [];
  
  // Update activity for each member
  Object.entries(factionData.members).forEach(([memberId, memberData]) => {
    // Initialize member if they don't exist in our records
    if (!activityData.members[memberId]) {
      activityData.members[memberId] = {
        name: memberData.name,
        hourlyActivity: {},
        lastAction: memberData.last_action.timestamp,
        activityScore: 0
      };
    }
    
    // Update member data
    activityData.members[memberId].name = memberData.name;
    activityData.members[memberId].lastAction = memberData.last_action.timestamp;
    
    // Calculate if member is currently active (last action within 10 minutes)
    const isActive = now.getTime() / 1000 - memberData.last_action.timestamp < 600; // 10 minutes
    
    // Update member's hourly activity for this time slot
    if (!activityData.members[memberId].hourlyActivity[day]) {
      activityData.members[memberId].hourlyActivity[day] = {};
    }
    
    if (!activityData.members[memberId].hourlyActivity[day][hour]) {
      activityData.members[memberId].hourlyActivity[day][hour] = {
        active: false,
        count: 0
      };
    }
    
    if (isActive) {
      activityData.members[memberId].hourlyActivity[day][hour].active = true;
      activityData.members[memberId].hourlyActivity[day][hour].count++;
      activityData.members[memberId].activityScore++;
      
      // Update the hour data
      hourData.activeMembers++;
      hourData.activeIds.push(memberId);
    }
  });
  
  // Update timestamp
  activityData.lastUpdate = now.toISOString();
  
  // Save updated data
  saveActivityData();
}

/**
 * Generate a heat map for faction activity
 * @param {string} view - View type: 'weekly', 'daily', or 'members'
 * @param {number} day - Day of week (0-6) for daily view
 * @returns {Object} Heat map data
 */
function generateHeatMap(view = 'weekly', day = null) {
  const heatMap = {
    type: view,
    data: {},
    lastUpdate: activityData.lastUpdate
  };
  
  switch (view) {
    case 'weekly':
      // Generate weekly heat map (hours x days)
      for (let d = 0; d < 7; d++) {
        heatMap.data[d] = {};
        for (let h = 0; h < 24; h++) {
          if (activityData.hourlyActivity[d] && activityData.hourlyActivity[d][h]) {
            const hourData = activityData.hourlyActivity[d][h];
            heatMap.data[d][h] = hourData.activeMembers / Math.max(1, hourData.totalMembers);
          } else {
            heatMap.data[d][h] = 0;
          }
        }
      }
      break;
      
    case 'daily':
      // Generate daily heat map for a specific day (hours x members)
      if (day === null) {
        day = new Date().getUTCDay();
      }
      
      Object.keys(activityData.members).forEach(memberId => {
        heatMap.data[memberId] = {
          name: activityData.members[memberId].name,
          hours: {}
        };
        
        for (let h = 0; h < 24; h++) {
          if (activityData.members[memberId].hourlyActivity[day] && 
              activityData.members[memberId].hourlyActivity[day][h]) {
            heatMap.data[memberId].hours[h] = activityData.members[memberId].hourlyActivity[day][h].count;
          } else {
            heatMap.data[memberId].hours[h] = 0;
          }
        }
      });
      break;
      
    case 'members':
      // Generate member activity heat map
      Object.keys(activityData.members).forEach(memberId => {
        heatMap.data[memberId] = {
          name: activityData.members[memberId].name,
          score: activityData.members[memberId].activityScore,
          lastAction: activityData.members[memberId].lastAction
        };
      });
      break;
  }
  
  return heatMap;
}

/**
 * Generate Discord embed content for heat map visualization
 * @param {Object} heatMap - Heat map data
 * @param {string} factionName - Faction name
 * @returns {Object} Discord embed content
 */
function generateHeatMapEmbed(heatMap, factionName) {
  const embed = {
    title: `Activity Heat Map for ${factionName}`,
    color: 0x3498db,
    description: 'Showing faction member activity patterns',
    timestamp: new Date().toISOString(),
    fields: []
  };
  
  const now = new Date();
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  if (heatMap.type === 'weekly') {
    // Weekly heat map visualization
    embed.description = `Weekly activity pattern for ${factionName}\nShowing percentage of active members by hour (UTC time)`;
    
    for (let d = 0; d < 7; d++) {
      let dayHeatMap = '';
      for (let h = 0; h < 24; h++) {
        const activity = heatMap.data[d] && heatMap.data[d][h] ? heatMap.data[d][h] : 0;
        dayHeatMap += getHeatMapEmoji(activity);
        
        // Add hour markers every 6 hours
        if ((h + 1) % 6 === 0 && h < 23) {
          dayHeatMap += ' ';
        }
      }
      embed.fields.push({
        name: weekdays[d],
        value: dayHeatMap + '\n0   6   12   18   24'
      });
    }
    
    embed.footer = {
      text: 'Heat map shows percentage of active members. Last updated'
    };
  } else if (heatMap.type === 'daily') {
    // Daily heat map visualization for top members
    const day = now.getUTCDay();
    const selectedDay = heatMap.day !== undefined ? heatMap.day : day;
    
    embed.title = `Activity Heat Map for ${factionName} - ${weekdays[selectedDay]}`;
    embed.description = `Showing activity patterns for members on ${weekdays[selectedDay]} (UTC time)`;
    
    // Sort members by activity score
    const sortedMembers = Object.keys(heatMap.data)
      .map(id => ({ id, ...heatMap.data[id] }))
      .sort((a, b) => {
        const aTotal = Object.values(a.hours).reduce((sum, val) => sum + val, 0);
        const bTotal = Object.values(b.hours).reduce((sum, val) => sum + val, 0);
        return bTotal - aTotal;
      })
      .slice(0, 10); // Top 10 most active members
    
    sortedMembers.forEach(member => {
      let memberHeatMap = '';
      for (let h = 0; h < 24; h++) {
        const activity = member.hours[h] ? member.hours[h] / 10 : 0; // Normalize
        memberHeatMap += getHeatMapEmoji(activity);
        
        // Add hour markers every 6 hours
        if ((h + 1) % 6 === 0 && h < 23) {
          memberHeatMap += ' ';
        }
      }
      
      const totalActivity = Object.values(member.hours).reduce((sum, val) => sum + val, 0);
      
      embed.fields.push({
        name: `${member.name} (${totalActivity} activities)`,
        value: memberHeatMap + '\n0   6   12   18   24'
      });
    });
    
    embed.footer = {
      text: 'Heat map shows relative activity level. Last updated'
    };
  } else if (heatMap.type === 'members') {
    // Member activity ranking
    embed.title = `Member Activity Ranking for ${factionName}`;
    embed.description = 'Showing overall member activity scores and last actions';
    
    // Sort members by activity score
    const sortedMembers = Object.keys(heatMap.data)
      .map(id => ({ id, ...heatMap.data[id] }))
      .sort((a, b) => b.score - a.score);
    
    let memberList = '';
    sortedMembers.slice(0, 20).forEach((member, index) => {
      const lastActionTime = new Date(member.lastAction * 1000);
      const timeAgo = getTimeAgo(lastActionTime);
      memberList += `${index + 1}. **${member.name}** - Score: ${member.score} - Last action: ${timeAgo}\n`;
    });
    
    embed.fields.push({
      name: 'Top Active Members',
      value: memberList || 'No activity data available'
    });
    
    embed.footer = {
      text: 'Activity score based on observed online patterns. Last updated'
    };
  }
  
  return embed;
}

/**
 * Generate components for interactive heat map viewing
 * @param {string} currentView - Current view type
 * @param {number} currentDay - Current day selection
 * @returns {Array} Discord message components
 */
function generateHeatMapComponents(currentView = 'weekly', currentDay = null) {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  const viewSelect = {
    type: 1,
    components: [
      {
        type: 3,
        custom_id: 'heatmap_view',
        options: [
          {
            label: 'Weekly Overview',
            value: 'weekly',
            description: 'View activity across the entire week',
            default: currentView === 'weekly'
          },
          {
            label: 'Daily Breakdown',
            value: 'daily',
            description: 'View detailed activity for a specific day',
            default: currentView === 'daily'
          },
          {
            label: 'Member Ranking',
            value: 'members',
            description: 'View member activity ranking',
            default: currentView === 'members'
          }
        ],
        placeholder: 'Select a heat map view'
      }
    ]
  };
  
  const components = [viewSelect];
  
  // Add day selector for daily view
  if (currentView === 'daily') {
    const daySelect = {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: 'heatmap_day',
          options: weekdays.map((day, index) => ({
            label: day,
            value: index.toString(),
            description: `View activity for ${day}`,
            default: currentDay === index
          })),
          placeholder: 'Select a day'
        }
      ]
    };
    components.push(daySelect);
  }
  
  // Add refresh button
  const refreshButton = {
    type: 1,
    components: [
      {
        type: 2,
        style: 1,
        label: 'Refresh Data',
        custom_id: 'heatmap_refresh',
        emoji: {
          name: '🔄'
        }
      }
    ]
  };
  components.push(refreshButton);
  
  return components;
}

/**
 * Get an emoji representation for heat map intensity
 * @param {number} value - Activity value (0-1)
 * @returns {string} Emoji representing the activity level
 */
function getHeatMapEmoji(value) {
  if (value === 0) return '⬛'; // None
  if (value < 0.2) return '🟦'; // Very low
  if (value < 0.4) return '🟩'; // Low
  if (value < 0.6) return '🟨'; // Medium
  if (value < 0.8) return '🟧'; // High
  return '🟥'; // Very high
}

/**
 * Get a human-readable time ago string
 * @param {Date} date - Date to compare
 * @returns {string} Time ago string
 */
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  let interval = Math.floor(seconds / 31536000);
  if (interval > 1) return `${interval} years ago`;
  
  interval = Math.floor(seconds / 2592000);
  if (interval > 1) return `${interval} months ago`;
  
  interval = Math.floor(seconds / 86400);
  if (interval > 1) return `${interval} days ago`;
  
  interval = Math.floor(seconds / 3600);
  if (interval > 1) return `${interval} hours ago`;
  
  interval = Math.floor(seconds / 60);
  if (interval > 1) return `${interval} minutes ago`;
  
  return `${Math.floor(seconds)} seconds ago`;
}

// Initialize data on load
loadActivityData();

// Export functions
module.exports = {
  updateActivityData,
  generateHeatMap,
  generateHeatMapEmbed,
  generateHeatMapComponents
};
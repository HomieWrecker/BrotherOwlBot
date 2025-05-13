/**
 * Event service for Brother Owl
 * Handles faction event scheduling, countdowns, and reminders
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');
const { formatDate } = require('../utils/formatting');
const { EmbedBuilder } = require('discord.js');
const { BOT_CONFIG } = require('../config');
const { getServerConfig } = require('./server-config');

// Event storage
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'faction_events.json');

// Make sure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize events
let events = {};
try {
  if (fs.existsSync(EVENTS_FILE)) {
    events = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  } else {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events), 'utf8');
  }
} catch (error) {
  logError('Error initializing events:', error);
}

// Store scheduled reminders
const scheduledReminders = {};

/**
 * Save events to file
 * @returns {boolean} Success state
 */
function saveEvents() {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf8');
    return true;
  } catch (error) {
    logError('Error saving events:', error);
    return false;
  }
}

/**
 * Create a new event
 * @param {string} serverId - Discord server ID
 * @param {string} eventId - Unique ID for the event
 * @param {string} name - Event name
 * @param {Date|number} date - Event date/time
 * @param {string} description - Event description
 * @param {string} creatorId - Discord user ID of the creator
 * @param {Object} options - Additional options
 * @returns {boolean} Success state
 */
function createEvent(serverId, eventId, name, date, description, creatorId, options = {}) {
  try {
    // Initialize server events if they don't exist
    if (!events[serverId]) {
      events[serverId] = {};
    }
    
    // Create the event
    events[serverId][eventId] = {
      name,
      date: date instanceof Date ? date.toISOString() : new Date(date).toISOString(),
      description,
      creatorId,
      created: new Date().toISOString(),
      remindersSent: [],
      participants: [], // Array to track participants
      maxParticipants: options.maxParticipants || 0, // 0 means unlimited
      ...options
    };
    
    saveEvents();
    log(`Created event ${name} [${eventId}] for server ${serverId}`);
    
    // Schedule reminders for this event
    scheduleEventReminders(serverId, eventId);
    
    return true;
  } catch (error) {
    logError(`Error creating event for server ${serverId}:`, error);
    return false;
  }
}

/**
 * Update an existing event
 * @param {string} serverId - Discord server ID
 * @param {string} eventId - Unique ID for the event
 * @param {Object} updates - Fields to update
 * @returns {boolean} Success state
 */
function updateEvent(serverId, eventId, updates) {
  try {
    // Check if event exists
    if (!events[serverId] || !events[serverId][eventId]) {
      return false;
    }
    
    // Update fields
    const event = events[serverId][eventId];
    Object.assign(event, updates);
    
    // If date changed, convert to ISO string
    if (updates.date) {
      event.date = updates.date instanceof Date ? 
        updates.date.toISOString() : 
        new Date(updates.date).toISOString();
        
      // Reset reminders if date changed
      event.remindersSent = [];
      
      // Reschedule reminders
      cancelEventReminders(serverId, eventId);
      scheduleEventReminders(serverId, eventId);
    }
    
    saveEvents();
    log(`Updated event ${eventId} for server ${serverId}`);
    return true;
  } catch (error) {
    logError(`Error updating event ${eventId} for server ${serverId}:`, error);
    return false;
  }
}

/**
 * Delete an event
 * @param {string} serverId - Discord server ID
 * @param {string} eventId - Unique ID for the event
 * @returns {boolean} Success state
 */
function deleteEvent(serverId, eventId) {
  try {
    // Check if event exists
    if (!events[serverId] || !events[serverId][eventId]) {
      return false;
    }
    
    // Cancel reminders
    cancelEventReminders(serverId, eventId);
    
    // Delete the event
    delete events[serverId][eventId];
    
    // Delete server entry if no events left
    if (Object.keys(events[serverId]).length === 0) {
      delete events[serverId];
    }
    
    saveEvents();
    log(`Deleted event ${eventId} for server ${serverId}`);
    return true;
  } catch (error) {
    logError(`Error deleting event ${eventId} for server ${serverId}:`, error);
    return false;
  }
}

/**
 * Get all events for a server
 * @param {string} serverId - Discord server ID
 * @returns {Array} Array of events
 */
function getServerEvents(serverId) {
  if (!events[serverId]) {
    return [];
  }
  
  return Object.entries(events[serverId])
    .map(([id, event]) => ({
      id,
      ...event,
      date: new Date(event.date)
    }))
    .sort((a, b) => a.date - b.date);
}

/**
 * Get a specific event
 * @param {string} serverId - Discord server ID
 * @param {string} eventId - Event ID
 * @returns {Object|null} Event or null if not found
 */
function getEvent(serverId, eventId) {
  if (!events[serverId] || !events[serverId][eventId]) {
    return null;
  }
  
  const event = events[serverId][eventId];
  return {
    id: eventId,
    ...event,
    date: new Date(event.date)
  };
}

/**
 * Get upcoming events for a server
 * @param {string} serverId - Discord server ID
 * @param {number} limit - Maximum number of events to return
 * @returns {Array} Array of upcoming events
 */
function getUpcomingEvents(serverId, limit = 5) {
  const now = new Date();
  
  return getServerEvents(serverId)
    .filter(event => event.date > now)
    .slice(0, limit);
}

/**
 * Schedule reminders for an event
 * @param {string} serverId - Discord server ID
 * @param {string} eventId - Event ID
 */
function scheduleEventReminders(serverId, eventId) {
  // Get the event
  const event = getEvent(serverId, eventId);
  if (!event) return;
  
  // Define reminder times (in minutes before the event)
  const reminderTimes = [1440, 60, 10]; // 24 hours, 1 hour, 10 minutes
  
  // Schedule each reminder
  for (const minutes of reminderTimes) {
    const reminderTime = new Date(event.date.getTime() - (minutes * 60 * 1000));
    const now = new Date();
    
    // Skip if reminder time is in the past or already sent
    if (reminderTime <= now || event.remindersSent.includes(minutes.toString())) {
      continue;
    }
    
    const delay = reminderTime.getTime() - now.getTime();
    
    // Create a unique key for this reminder
    const reminderKey = `${serverId}_${eventId}_${minutes}`;
    
    // Schedule the reminder
    const timerId = setTimeout(() => {
      sendEventReminder(serverId, eventId, minutes);
      
      // Clean up
      delete scheduledReminders[reminderKey];
    }, delay);
    
    // Store the timer ID for cancellation if needed
    scheduledReminders[reminderKey] = timerId;
    
    log(`Scheduled ${minutes} minute reminder for event ${event.name} [${eventId}] at ${reminderTime}`);
  }
}

/**
 * Cancel scheduled reminders for an event
 * @param {string} serverId - Discord server ID
 * @param {string} eventId - Event ID
 */
function cancelEventReminders(serverId, eventId) {
  // Find all reminders for this event
  const reminderKeys = Object.keys(scheduledReminders)
    .filter(key => key.startsWith(`${serverId}_${eventId}_`));
  
  // Cancel each reminder
  for (const key of reminderKeys) {
    clearTimeout(scheduledReminders[key]);
    delete scheduledReminders[key];
  }
  
  log(`Cancelled reminders for event ${eventId} in server ${serverId}`);
}

/**
 * Send a reminder for an event
 * @param {string} serverId - Discord server ID
 * @param {string} eventId - Event ID
 * @param {number} minutes - Minutes before the event
 */
async function sendEventReminder(serverId, eventId, minutes) {
  try {
    // Get the event
    const event = getEvent(serverId, eventId);
    if (!event) return;
    
    // Get server configuration
    const serverConfig = getServerConfig(serverId);
    if (!serverConfig || !serverConfig.eventConfig || !serverConfig.eventConfig.reminderChannelId) {
      log(`Cannot send reminder for event ${eventId}: No reminder channel configured`);
      return;
    }
    
    const { reminderChannelId, reminderRoleId } = serverConfig.eventConfig;
    
    // Get the Discord client and channel
    const client = global.discordClient;
    if (!client) {
      log(`Cannot send reminder for event ${eventId}: No Discord client available`);
      return;
    }
    
    const guild = await client.guilds.fetch(serverId).catch(() => null);
    if (!guild) {
      log(`Cannot send reminder for event ${eventId}: Guild ${serverId} not found`);
      return;
    }
    
    const channel = await guild.channels.fetch(reminderChannelId).catch(() => null);
    if (!channel) {
      log(`Cannot send reminder for event ${eventId}: Channel ${reminderChannelId} not found`);
      return;
    }
    
    // Format the reminder time
    let timeText;
    if (minutes >= 1440) {
      timeText = `${minutes / 1440} day(s)`;
    } else if (minutes >= 60) {
      timeText = `${minutes / 60} hour(s)`;
    } else {
      timeText = `${minutes} minute(s)`;
    }
    
    // Create the reminder embed
    const embed = new EmbedBuilder()
      .setTitle(`🔔 Event Reminder: ${event.name}`)
      .setColor(BOT_CONFIG.color)
      .setDescription(`**${event.name}** will start in **${timeText}**!`)
      .addFields(
        { name: 'Description', value: event.description || 'No description provided', inline: false },
        { name: 'When', value: formatDate(event.date), inline: true },
        { name: 'Created by', value: `<@${event.creatorId}>`, inline: true }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Event ID: ${eventId}` })
      .setTimestamp();
    
    // Mention role if configured
    const mentionText = reminderRoleId ? `<@&${reminderRoleId}> ` : '';
    
    // Send the reminder
    await channel.send({
      content: `${mentionText}Event reminder:`,
      embeds: [embed]
    });
    
    // Mark reminder as sent
    if (!event.remindersSent.includes(minutes.toString())) {
      events[serverId][eventId].remindersSent.push(minutes.toString());
      saveEvents();
    }
    
    log(`Sent ${minutes} minute reminder for event ${event.name} [${eventId}]`);
  } catch (error) {
    logError(`Error sending reminder for event ${eventId}:`, error);
  }
}

/**
 * Initialize the event service
 * @param {Client} client - Discord client
 */
function initEventService(client) {
  // Schedule reminders for all events
  for (const serverId in events) {
    for (const eventId in events[serverId]) {
      scheduleEventReminders(serverId, eventId);
    }
  }
  
  log('Event service initialized');
  
  // Set up a daily cleanup task
  setInterval(() => {
    cleanupPastEvents();
  }, 24 * 60 * 60 * 1000); // Run once per day
}

/**
 * Clean up events that are in the past
 */
function cleanupPastEvents() {
  const now = new Date();
  let count = 0;
  
  // For each server
  for (const serverId in events) {
    // For each event
    for (const eventId in events[serverId]) {
      const event = events[serverId][eventId];
      const eventDate = new Date(event.date);
      
      // If event is more than 1 day in the past, delete it
      if (eventDate < new Date(now.getTime() - (24 * 60 * 60 * 1000))) {
        delete events[serverId][eventId];
        count++;
      }
    }
    
    // If no events left for this server, delete the server entry
    if (Object.keys(events[serverId]).length === 0) {
      delete events[serverId];
    }
  }
  
  if (count > 0) {
    saveEvents();
    log(`Cleaned up ${count} past events`);
  }
}

/**
 * Calculate time remaining until an event
 * @param {Date} eventDate - Event date
 * @returns {Object} Object with days, hours, minutes, seconds
 */
function getTimeRemaining(eventDate) {
  const total = eventDate.getTime() - new Date().getTime();
  
  // Return all zeros if the event is in the past
  if (total <= 0) {
    return {
      total: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0
    };
  }
  
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  
  return {
    total,
    days,
    hours,
    minutes,
    seconds
  };
}

/**
 * Format time remaining as a string
 * @param {Date} eventDate - Event date
 * @returns {string} Formatted time string
 */
function formatTimeRemaining(eventDate) {
  const time = getTimeRemaining(eventDate);
  
  // Event has already occurred
  if (time.total <= 0) {
    return 'Event has already occurred';
  }
  
  // Format parts
  const parts = [];
  if (time.days > 0) parts.push(`${time.days}d`);
  if (time.hours > 0) parts.push(`${time.hours}h`);
  if (time.minutes > 0) parts.push(`${time.minutes}m`);
  if (time.seconds > 0) parts.push(`${time.seconds}s`);
  
  return parts.join(' ');
}

/**
 * Parse relative time in the format +XhYm
 * @param {string} timeStr - Time string in the format +XhYm
 * @returns {number|null} Milliseconds or null if invalid
 */
function parseRelativeTime(timeStr) {
  try {
    // Should start with a plus sign
    if (!timeStr.startsWith('+')) return null;
    
    // Remove the plus sign
    timeStr = timeStr.substring(1);
    
    // Match hours and minutes
    const hoursMatch = timeStr.match(/(\d+)h/);
    const minutesMatch = timeStr.match(/(\d+)m/);
    
    // Calculate total milliseconds
    let totalMs = 0;
    
    if (hoursMatch) {
      totalMs += parseInt(hoursMatch[1]) * 60 * 60 * 1000;
    }
    
    if (minutesMatch) {
      totalMs += parseInt(minutesMatch[1]) * 60 * 1000;
    }
    
    // If no valid time units were found, return null
    if (totalMs === 0 && !hoursMatch && !minutesMatch) {
      return null;
    }
    
    return totalMs;
  } catch (error) {
    return null;
  }
}

/**
 * Add a participant to an event
 * @param {string} serverId - Discord server ID
 * @param {string} eventId - Event ID
 * @param {string} userId - Discord user ID
 * @param {string} userName - Discord user name
 * @returns {boolean} Success state
 */
function addParticipant(serverId, eventId, userId, userName) {
  try {
    // Check if event exists
    if (!events[serverId] || !events[serverId][eventId]) {
      return false;
    }
    
    const event = events[serverId][eventId];
    
    // Check if user is already a participant
    if (event.participants && event.participants.some(p => p.id === userId)) {
      return false; // Already signed up
    }
    
    // Check if event is at capacity
    if (event.maxParticipants > 0 && event.participants.length >= event.maxParticipants) {
      return false; // Event is full
    }
    
    // Initialize participants array if not present
    if (!event.participants) {
      event.participants = [];
    }
    
    // Add participant
    event.participants.push({
      id: userId,
      name: userName,
      joinedAt: new Date().toISOString()
    });
    
    saveEvents();
    log(`Added participant ${userName} (${userId}) to event ${eventId}`);
    return true;
  } catch (error) {
    logError(`Error adding participant to event ${eventId}:`, error);
    return false;
  }
}

/**
 * Remove a participant from an event
 * @param {string} serverId - Discord server ID
 * @param {string} eventId - Event ID
 * @param {string} userId - Discord user ID
 * @returns {boolean} Success state
 */
function removeParticipant(serverId, eventId, userId) {
  try {
    // Check if event exists
    if (!events[serverId] || !events[serverId][eventId]) {
      return false;
    }
    
    const event = events[serverId][eventId];
    
    // Check if participants array exists
    if (!event.participants || !Array.isArray(event.participants)) {
      return false;
    }
    
    // Check if user is a participant
    const participantIndex = event.participants.findIndex(p => p.id === userId);
    if (participantIndex === -1) {
      return false; // Not signed up
    }
    
    // Remove participant
    event.participants.splice(participantIndex, 1);
    
    saveEvents();
    log(`Removed participant with ID ${userId} from event ${eventId}`);
    return true;
  } catch (error) {
    logError(`Error removing participant from event ${eventId}:`, error);
    return false;
  }
}

/**
 * Get event participants
 * @param {string} serverId - Discord server ID
 * @param {string} eventId - Event ID
 * @returns {Array} Array of participants
 */
function getParticipants(serverId, eventId) {
  // Check if event exists
  if (!events[serverId] || !events[serverId][eventId]) {
    return [];
  }
  
  const event = events[serverId][eventId];
  
  // Return participants array or empty array if none
  return event.participants || [];
}

/**
 * Converts a date to Torn City time (UTC)
 * @param {Date} date - Date to convert
 * @returns {string} Formatted date and time in Torn City time
 */
function toTornTime(date) {
  const tornDate = new Date(date);
  return tornDate.toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }) + ' TCT'; // Add TCT (Torn City Time) indicator
}

module.exports = {
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  getServerEvents,
  getUpcomingEvents,
  initEventService,
  formatTimeRemaining,
  getTimeRemaining,
  parseRelativeTime,
  addParticipant,
  removeParticipant,
  getParticipants,
  toTornTime
};
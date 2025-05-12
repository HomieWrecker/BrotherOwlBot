/**
 * ChainSheet service for BrotherOwlManager
 * Handles chainsheet signup, time zone conversions, and live updates
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { BOT_CONFIG } = require('../config');

// Data storage
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CHAINSHEETS_FILE = path.join(DATA_DIR, 'chainsheets.json');
const USER_TIMEZONES_FILE = path.join(DATA_DIR, 'user_timezones.json');

// Make sure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize chainsheets
let chainsheets = {};
try {
  if (fs.existsSync(CHAINSHEETS_FILE)) {
    chainsheets = JSON.parse(fs.readFileSync(CHAINSHEETS_FILE, 'utf8'));
  } else {
    fs.writeFileSync(CHAINSHEETS_FILE, JSON.stringify(chainsheets), 'utf8');
  }
} catch (error) {
  logError('Error initializing chainsheets:', error);
}

// Initialize user timezones
let userTimezones = {};
try {
  if (fs.existsSync(USER_TIMEZONES_FILE)) {
    userTimezones = JSON.parse(fs.readFileSync(USER_TIMEZONES_FILE, 'utf8'));
  } else {
    fs.writeFileSync(USER_TIMEZONES_FILE, JSON.stringify(userTimezones), 'utf8');
  }
} catch (error) {
  logError('Error initializing user timezones:', error);
}

// Store active message update intervals
const messageUpdateIntervals = {};

// Store scheduled reminders
const scheduledReminders = {};

/**
 * Save chainsheets to file
 * @returns {boolean} Success state
 */
function saveChainsheets() {
  try {
    fs.writeFileSync(CHAINSHEETS_FILE, JSON.stringify(chainsheets, null, 2), 'utf8');
    return true;
  } catch (error) {
    logError('Error saving chainsheets:', error);
    return false;
  }
}

/**
 * Save user timezones to file
 * @returns {boolean} Success state
 */
function saveUserTimezones() {
  try {
    fs.writeFileSync(USER_TIMEZONES_FILE, JSON.stringify(userTimezones, null, 2), 'utf8');
    return true;
  } catch (error) {
    logError('Error saving user timezones:', error);
    return false;
  }
}

/**
 * Create a new chainsheet
 * @param {string} serverId - Discord server ID
 * @param {string} channelId - Discord channel ID where the chainsheet will be posted
 * @param {string} creatorId - Discord user ID of the creator
 * @param {Object} options - Additional options
 * @returns {Promise<Object|null>} Chainsheet data or null if failed
 */
async function createChainsheet(serverId, channelId, creatorId, options = {}) {
  try {
    // Generate a unique ID for the chainsheet
    const sheetId = Date.now().toString();
    
    // Create the chainsheet
    const chainsheet = {
      id: sheetId,
      serverId,
      channelId,
      creatorId,
      created: new Date().toISOString(),
      messageId: null,
      active: true,
      participants: [],
      options: {
        title: options.title || 'Chain Sign-up Sheet',
        description: options.description || 'Sign up for chain by providing your available time slots.',
        ...options
      }
    };
    
    // Store the chainsheet
    if (!chainsheets[serverId]) {
      chainsheets[serverId] = {};
    }
    chainsheets[serverId][sheetId] = chainsheet;
    
    // Save to file
    saveChainsheets();
    
    log(`Created chainsheet ${sheetId} for server ${serverId}`);
    return chainsheet;
  } catch (error) {
    logError('Error creating chainsheet:', error);
    return null;
  }
}

/**
 * Get a chainsheet by ID
 * @param {string} serverId - Discord server ID
 * @param {string} sheetId - Chainsheet ID
 * @returns {Object|null} Chainsheet data or null if not found
 */
function getChainsheet(serverId, sheetId) {
  if (!chainsheets[serverId] || !chainsheets[serverId][sheetId]) {
    return null;
  }
  
  return chainsheets[serverId][sheetId];
}

/**
 * Get all active chainsheets for a server
 * @param {string} serverId - Discord server ID
 * @returns {Array} Array of chainsheets
 */
function getActiveChainsheets(serverId) {
  if (!chainsheets[serverId]) {
    return [];
  }
  
  return Object.values(chainsheets[serverId])
    .filter(sheet => sheet.active);
}

/**
 * Close a chainsheet (mark as inactive)
 * @param {string} serverId - Discord server ID
 * @param {string} sheetId - Chainsheet ID
 * @returns {boolean} Success state
 */
function closeChainsheet(serverId, sheetId) {
  try {
    const chainsheet = getChainsheet(serverId, sheetId);
    if (!chainsheet) {
      return false;
    }
    
    // Mark as inactive
    chainsheet.active = false;
    
    // Clear update interval
    clearUpdateInterval(sheetId);
    
    // Clear all scheduled reminders
    clearAllReminders(serverId, sheetId);
    
    // Save to file
    saveChainsheets();
    
    log(`Closed chainsheet ${sheetId} for server ${serverId}`);
    return true;
  } catch (error) {
    logError(`Error closing chainsheet ${sheetId}:`, error);
    return false;
  }
}

/**
 * Add a participant to a chainsheet
 * @param {string} serverId - Discord server ID
 * @param {string} sheetId - Chainsheet ID
 * @param {string} userId - Discord user ID
 * @param {string} startTime - Start time (format: HH:MM)
 * @param {string} endTime - End time (format: HH:MM)
 * @param {string} timezone - User's timezone
 * @returns {Object|null} Updated chainsheet or null if failed
 */
function addParticipant(serverId, sheetId, userId, startTime, endTime, timezone) {
  try {
    const chainsheet = getChainsheet(serverId, sheetId);
    if (!chainsheet || !chainsheet.active) {
      return null;
    }
    
    // Convert times to Torn City time (UTC)
    const tornStartTime = convertToTornTime(startTime, timezone);
    const tornEndTime = convertToTornTime(endTime, timezone);
    
    // Check if user is already in the sheet
    const existingIndex = chainsheet.participants.findIndex(p => p.userId === userId);
    
    // Participant object
    const participant = {
      userId,
      username: null, // Will be set when rendering
      startTime: tornStartTime,
      endTime: tornEndTime,
      originalStartTime: startTime,
      originalEndTime: endTime,
      timezone,
      signupTime: new Date().toISOString()
    };
    
    // Add or update participant
    if (existingIndex >= 0) {
      chainsheet.participants[existingIndex] = participant;
    } else {
      chainsheet.participants.push(participant);
    }
    
    // Save user's timezone preference
    saveUserTimezone(userId, timezone);
    
    // Sort participants by start time
    chainsheet.participants.sort((a, b) => {
      const aTime = parseTimeString(a.startTime);
      const bTime = parseTimeString(b.startTime);
      return aTime - bTime;
    });
    
    // Schedule reminder
    scheduleParticipantReminder(serverId, sheetId, userId);
    
    // Save to file
    saveChainsheets();
    
    log(`Added participant ${userId} to chainsheet ${sheetId}`);
    return chainsheet;
  } catch (error) {
    logError(`Error adding participant to chainsheet ${sheetId}:`, error);
    return null;
  }
}

/**
 * Remove a participant from a chainsheet
 * @param {string} serverId - Discord server ID
 * @param {string} sheetId - Chainsheet ID
 * @param {string} userId - Discord user ID
 * @returns {Object|null} Updated chainsheet or null if failed
 */
function removeParticipant(serverId, sheetId, userId) {
  try {
    const chainsheet = getChainsheet(serverId, sheetId);
    if (!chainsheet) {
      return null;
    }
    
    // Filter out the participant
    chainsheet.participants = chainsheet.participants.filter(p => p.userId !== userId);
    
    // Clear scheduled reminder
    clearParticipantReminders(serverId, sheetId, userId);
    
    // Save to file
    saveChainsheets();
    
    log(`Removed participant ${userId} from chainsheet ${sheetId}`);
    return chainsheet;
  } catch (error) {
    logError(`Error removing participant from chainsheet ${sheetId}:`, error);
    return null;
  }
}

/**
 * Set the message ID for a chainsheet
 * @param {string} serverId - Discord server ID
 * @param {string} sheetId - Chainsheet ID
 * @param {string} messageId - Discord message ID
 * @returns {boolean} Success state
 */
function setChainsheetMessage(serverId, sheetId, messageId) {
  try {
    const chainsheet = getChainsheet(serverId, sheetId);
    if (!chainsheet) {
      return false;
    }
    
    chainsheet.messageId = messageId;
    saveChainsheets();
    
    log(`Set message ID ${messageId} for chainsheet ${sheetId}`);
    return true;
  } catch (error) {
    logError(`Error setting message ID for chainsheet ${sheetId}:`, error);
    return false;
  }
}

/**
 * Update the chain count for a chainsheet
 * @param {string} serverId - Discord server ID
 * @param {string} sheetId - Chainsheet ID
 * @param {number} chainCount - Current chain count
 * @returns {boolean} Success state
 */
function updateChainCount(serverId, sheetId, chainCount) {
  try {
    const chainsheet = getChainsheet(serverId, sheetId);
    if (!chainsheet) {
      return false;
    }
    
    chainsheet.chainCount = chainCount;
    saveChainsheets();
    
    log(`Updated chain count to ${chainCount} for chainsheet ${sheetId}`);
    return true;
  } catch (error) {
    logError(`Error updating chain count for chainsheet ${sheetId}:`, error);
    return false;
  }
}

/**
 * Save a user's timezone preference
 * @param {string} userId - Discord user ID
 * @param {string} timezone - Timezone
 * @returns {boolean} Success state
 */
function saveUserTimezone(userId, timezone) {
  try {
    userTimezones[userId] = timezone;
    saveUserTimezones();
    
    log(`Saved timezone ${timezone} for user ${userId}`);
    return true;
  } catch (error) {
    logError(`Error saving timezone for user ${userId}:`, error);
    return false;
  }
}

/**
 * Get a user's timezone preference
 * @param {string} userId - Discord user ID
 * @returns {string|null} Timezone or null if not set
 */
function getUserTimezone(userId) {
  return userTimezones[userId] || null;
}

/**
 * Create an embed for a chainsheet
 * @param {Object} chainsheet - Chainsheet data
 * @param {Client} client - Discord client
 * @returns {Promise<EmbedBuilder>} Discord embed
 */
async function createChainsheetEmbed(chainsheet, client) {
  try {
    // Fetch usernames for participants
    await updateParticipantUsernames(chainsheet, client);
    
    const embed = new EmbedBuilder()
      .setTitle(`🔗 ${chainsheet.options.title}`)
      .setColor(BOT_CONFIG.color)
      .setDescription(chainsheet.options.description)
      .setFooter({ 
        text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | ID: ${chainsheet.id} | Torn City Time (UTC)`
      })
      .setTimestamp();
    
    if (chainsheet.chainCount !== undefined) {
      embed.addFields({
        name: '🔢 Current Chain',
        value: `${chainsheet.chainCount.toLocaleString()} hits`,
        inline: true
      });
    }
    
    // Current Torn time
    const tornTime = new Date().toISOString().slice(11, 16);
    embed.addFields({
      name: '⏰ Current Torn Time',
      value: `${tornTime} UTC`,
      inline: true
    });
    
    // Participants field
    if (chainsheet.participants.length > 0) {
      let participantsText = '';
      
      for (const participant of chainsheet.participants) {
        const username = participant.username || `<@${participant.userId}>`;
        participantsText += `• **${username}**: ${participant.startTime} to ${participant.endTime} UTC `;
        
        // Add original time if different timezone
        if (participant.timezone !== 'UTC') {
          participantsText += `(${participant.originalStartTime} to ${participant.originalEndTime} ${participant.timezone})`;
        }
        
        participantsText += '\n';
      }
      
      embed.addFields({
        name: '👥 Participants',
        value: participantsText,
        inline: false
      });
    } else {
      embed.addFields({
        name: '👥 Participants',
        value: 'No participants yet. Use the "Sign Up" button to join!',
        inline: false
      });
    }
    
    return embed;
  } catch (error) {
    logError('Error creating chainsheet embed:', error);
    
    // Return a simple embed as fallback
    return new EmbedBuilder()
      .setTitle(`🔗 Chain Sign-up Sheet`)
      .setColor(BOT_CONFIG.color)
      .setDescription('An error occurred while creating the chainsheet embed.')
      .setFooter({ 
        text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | ID: ${chainsheet.id}`
      });
  }
}

/**
 * Create action row for chainsheet
 * @param {string} sheetId - Chainsheet ID
 * @param {boolean} isCreator - Whether the user is the creator of the chainsheet
 * @returns {ActionRowBuilder} Action row with buttons
 */
function createChainsheetActionRow(sheetId, isCreator = false) {
  const row = new ActionRowBuilder();
  
  // Add signup button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`chainsheet_signup_${sheetId}`)
      .setLabel('Sign Up')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝')
  );
  
  // Add withdrawal button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`chainsheet_withdraw_${sheetId}`)
      .setLabel('Withdraw')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚫')
  );
  
  // If the user is the creator, add update chain count and close buttons
  if (isCreator) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`chainsheet_updateCount_${sheetId}`)
        .setLabel('Update Chain Count')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔢')
    );
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`chainsheet_close_${sheetId}`)
        .setLabel('Close Sheet')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );
  }
  
  return row;
}

/**
 * Start auto-updating a chainsheet message
 * @param {string} sheetId - Chainsheet ID
 * @param {string} serverId - Discord server ID
 * @param {string} channelId - Discord channel ID
 * @param {string} messageId - Discord message ID
 * @param {Client} client - Discord client
 * @returns {boolean} Success state
 */
function startChainsheetUpdates(sheetId, serverId, channelId, messageId, client) {
  try {
    // Clear any existing interval
    clearUpdateInterval(sheetId);
    
    // Create update function
    const updateFunction = async () => {
      try {
        const chainsheet = getChainsheet(serverId, sheetId);
        if (!chainsheet || !chainsheet.active) {
          clearUpdateInterval(sheetId);
          return;
        }
        
        // Get the channel and message
        const guild = await client.guilds.fetch(serverId).catch(() => null);
        if (!guild) return;
        
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return;
        
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) return;
        
        // Create updated embed
        const embed = await createChainsheetEmbed(chainsheet, client);
        
        // Update the message
        await message.edit({
          embeds: [embed]
        }).catch(err => logError(`Error updating chainsheet message: ${err.message}`));
      } catch (error) {
        logError('Error in chainsheet update function:', error);
      }
    };
    
    // Start interval (update every minute)
    messageUpdateIntervals[sheetId] = setInterval(updateFunction, 60000);
    
    log(`Started auto-updates for chainsheet ${sheetId}`);
    return true;
  } catch (error) {
    logError(`Error starting chainsheet updates for ${sheetId}:`, error);
    return false;
  }
}

/**
 * Clear update interval for a chainsheet
 * @param {string} sheetId - Chainsheet ID
 */
function clearUpdateInterval(sheetId) {
  if (messageUpdateIntervals[sheetId]) {
    clearInterval(messageUpdateIntervals[sheetId]);
    delete messageUpdateIntervals[sheetId];
    log(`Cleared update interval for chainsheet ${sheetId}`);
  }
}

/**
 * Update usernames for participants in a chainsheet
 * @param {Object} chainsheet - Chainsheet data
 * @param {Client} client - Discord client
 */
async function updateParticipantUsernames(chainsheet, client) {
  try {
    const guild = await client.guilds.fetch(chainsheet.serverId).catch(() => null);
    if (!guild) return;
    
    for (const participant of chainsheet.participants) {
      if (!participant.username) {
        try {
          const member = await guild.members.fetch(participant.userId).catch(() => null);
          if (member) {
            participant.username = member.displayName;
          }
        } catch (error) {
          // If we can't fetch the member, just use the user ID
          logError(`Couldn't fetch member ${participant.userId}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    logError('Error updating participant usernames:', error);
  }
}

/**
 * Schedule a reminder for a participant
 * @param {string} serverId - Discord server ID
 * @param {string} sheetId - Chainsheet ID
 * @param {string} userId - Discord user ID
 */
function scheduleParticipantReminder(serverId, sheetId, userId) {
  try {
    const chainsheet = getChainsheet(serverId, sheetId);
    if (!chainsheet || !chainsheet.active) return;
    
    const participant = chainsheet.participants.find(p => p.userId === userId);
    if (!participant) return;
    
    // Clear any existing reminders
    clearParticipantReminders(serverId, sheetId, userId);
    
    // Schedule reminder for start time
    const now = new Date();
    const startTime = parseTimeString(participant.startTime);
    
    // Only schedule if the start time is in the future
    if (startTime > now) {
      const delay = startTime.getTime() - now.getTime();
      
      // Create a unique key for this reminder
      const reminderKey = `${serverId}_${sheetId}_${userId}_start`;
      
      // Schedule the reminder
      scheduledReminders[reminderKey] = setTimeout(() => {
        sendParticipantReminder(serverId, sheetId, userId, 'start');
        delete scheduledReminders[reminderKey];
      }, delay);
      
      log(`Scheduled start time reminder for participant ${userId} in chainsheet ${sheetId} at ${startTime}`);
    }
  } catch (error) {
    logError(`Error scheduling participant reminder for ${userId} in chainsheet ${sheetId}:`, error);
  }
}

/**
 * Clear scheduled reminders for a participant
 * @param {string} serverId - Discord server ID
 * @param {string} sheetId - Chainsheet ID
 * @param {string} userId - Discord user ID
 */
function clearParticipantReminders(serverId, sheetId, userId) {
  // Find all reminders for this participant
  const reminderKeys = Object.keys(scheduledReminders)
    .filter(key => key.startsWith(`${serverId}_${sheetId}_${userId}_`));
  
  // Cancel each reminder
  for (const key of reminderKeys) {
    clearTimeout(scheduledReminders[key]);
    delete scheduledReminders[key];
  }
  
  if (reminderKeys.length > 0) {
    log(`Cleared ${reminderKeys.length} reminders for participant ${userId} in chainsheet ${sheetId}`);
  }
}

/**
 * Clear all scheduled reminders for a chainsheet
 * @param {string} serverId - Discord server ID
 * @param {string} sheetId - Chainsheet ID
 */
function clearAllReminders(serverId, sheetId) {
  // Find all reminders for this chainsheet
  const reminderKeys = Object.keys(scheduledReminders)
    .filter(key => key.startsWith(`${serverId}_${sheetId}_`));
  
  // Cancel each reminder
  for (const key of reminderKeys) {
    clearTimeout(scheduledReminders[key]);
    delete scheduledReminders[key];
  }
  
  if (reminderKeys.length > 0) {
    log(`Cleared all ${reminderKeys.length} reminders for chainsheet ${sheetId}`);
  }
}

/**
 * Send a reminder to a participant
 * @param {string} serverId - Discord server ID
 * @param {string} sheetId - Chainsheet ID
 * @param {string} userId - Discord user ID
 * @param {string} type - Reminder type ('start' or 'end')
 */
async function sendParticipantReminder(serverId, sheetId, userId, type) {
  try {
    const chainsheet = getChainsheet(serverId, sheetId);
    if (!chainsheet || !chainsheet.active) return;
    
    const participant = chainsheet.participants.find(p => p.userId === userId);
    if (!participant) return;
    
    // Get Discord client
    const client = global.discordClient;
    if (!client) return;
    
    // Get guild and channel
    const guild = await client.guilds.fetch(serverId).catch(() => null);
    if (!guild) return;
    
    const channel = await guild.channels.fetch(chainsheet.channelId).catch(() => null);
    if (!channel) return;
    
    // Create reminder message
    let reminderMessage = '';
    if (type === 'start') {
      reminderMessage = `⏰ <@${userId}> Your chain shift is starting now! You signed up for ${participant.startTime} to ${participant.endTime} UTC.`;
    } else if (type === 'end') {
      reminderMessage = `⏰ <@${userId}> Your chain shift is ending now! Thanks for your contribution.`;
    }
    
    // Send the reminder
    await channel.send(reminderMessage)
      .catch(err => logError(`Error sending reminder to ${userId}: ${err.message}`));
    
    log(`Sent ${type} reminder to participant ${userId} in chainsheet ${sheetId}`);
  } catch (error) {
    logError(`Error sending reminder to ${userId} in chainsheet ${sheetId}:`, error);
  }
}

/**
 * Convert a time string to Date object for the current day
 * @param {string} timeStr - Time string in format HH:MM
 * @returns {Date} Date object
 */
function parseTimeString(timeStr) {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  } catch (error) {
    logError(`Error parsing time string ${timeStr}:`, error);
    return new Date();
  }
}

/**
 * Convert a time from a specific timezone to Torn City time (UTC)
 * @param {string} timeStr - Time string in format HH:MM
 * @param {string} timezone - Timezone identifier
 * @returns {string} Torn time in format HH:MM
 */
function convertToTornTime(timeStr, timezone) {
  try {
    // If the timezone is already UTC, no conversion needed
    if (timezone === 'UTC') {
      return timeStr;
    }
    
    // Parse the time string
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // Create a date object with the specified time
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    
    // Get the timezone offset in minutes
    const timezoneOffset = getTimezoneOffset(timezone);
    
    // Apply the offset to convert to UTC
    date.setMinutes(date.getMinutes() - timezoneOffset);
    
    // Format the UTC time
    const utcHours = date.getUTCHours().toString().padStart(2, '0');
    const utcMinutes = date.getUTCMinutes().toString().padStart(2, '0');
    
    return `${utcHours}:${utcMinutes}`;
  } catch (error) {
    logError(`Error converting time ${timeStr} from ${timezone} to Torn time:`, error);
    return timeStr;
  }
}

/**
 * Get the offset in minutes for a timezone
 * @param {string} timezone - Timezone identifier
 * @returns {number} Offset in minutes
 */
function getTimezoneOffset(timezone) {
  try {
    // Common timezone codes mapped to their UTC offsets
    const timezoneMap = {
      'UTC': 0,
      'GMT': 0,
      'EST': -5 * 60,
      'EDT': -4 * 60,
      'CST': -6 * 60,
      'CDT': -5 * 60,
      'MST': -7 * 60,
      'MDT': -6 * 60,
      'PST': -8 * 60,
      'PDT': -7 * 60,
      'BST': 1 * 60,
      'CET': 1 * 60,
      'CEST': 2 * 60,
      'EET': 2 * 60,
      'EEST': 3 * 60,
      'IST': 5.5 * 60,
      'JST': 9 * 60,
      'AEST': 10 * 60,
      'AEDT': 11 * 60,
      'NZST': 12 * 60,
      'NZDT': 13 * 60
    };
    
    // Handle UTC+/-X format
    if (timezone.startsWith('UTC+') || timezone.startsWith('UTC-')) {
      const hours = parseFloat(timezone.substring(3));
      return hours * 60;
    }
    
    // Handle GMT+/-X format
    if (timezone.startsWith('GMT+') || timezone.startsWith('GMT-')) {
      const hours = parseFloat(timezone.substring(3));
      return hours * 60;
    }
    
    // Look up in the map
    if (timezoneMap[timezone] !== undefined) {
      return timezoneMap[timezone];
    }
    
    // Default to 0 (UTC) if we can't determine the offset
    return 0;
  } catch (error) {
    logError(`Error getting timezone offset for ${timezone}:`, error);
    return 0;
  }
}

/**
 * Initialize chainsheet service
 * This will restart auto-updates for active chainsheets and schedule reminders
 * @param {Client} client - Discord client
 */
async function initChainsheetService(client) {
  try {
    // Restart auto-updates for active chainsheets
    for (const serverId in chainsheets) {
      for (const sheetId in chainsheets[serverId]) {
        const chainsheet = chainsheets[serverId][sheetId];
        
        if (chainsheet.active && chainsheet.messageId) {
          startChainsheetUpdates(sheetId, serverId, chainsheet.channelId, chainsheet.messageId, client);
          
          // Reschedule reminders for all participants
          for (const participant of chainsheet.participants) {
            scheduleParticipantReminder(serverId, sheetId, participant.userId);
          }
        }
      }
    }
    
    log('Chainsheet service initialized');
  } catch (error) {
    logError('Error initializing chainsheet service:', error);
  }
}

// Export functions
module.exports = {
  createChainsheet,
  getChainsheet,
  getActiveChainsheets,
  closeChainsheet,
  addParticipant,
  removeParticipant,
  setChainsheetMessage,
  updateChainCount,
  getUserTimezone,
  createChainsheetEmbed,
  createChainsheetActionRow,
  startChainsheetUpdates,
  initChainsheetService,
  convertToTornTime
};
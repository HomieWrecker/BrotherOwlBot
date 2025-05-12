/**
 * Giveaway service for BrotherOwlManager
 * Manages active giveaways, countdown timers, and winner selection
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');
const { 
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder
} = require('discord.js');

// Giveaway storage path
const GIVEAWAYS_FILE = path.join(__dirname, '../../data/giveaways.json');

// Store active giveaways and their timer IDs
let activeGiveaways = new Map();
let countdownIntervals = new Map();

// Initialize giveaway data
let giveawayData = {};
try {
  if (fs.existsSync(GIVEAWAYS_FILE)) {
    giveawayData = JSON.parse(fs.readFileSync(GIVEAWAYS_FILE, 'utf8'));
    log('Giveaway data loaded');
  } else {
    giveawayData = { giveaways: [] };
    saveGiveawayData();
  }
} catch (error) {
  logError('Error loading giveaway data:', error);
  giveawayData = { giveaways: [] };
}

/**
 * Save giveaway data to file
 */
function saveGiveawayData() {
  try {
    // Ensure the data directory exists
    const dataDir = path.dirname(GIVEAWAYS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(GIVEAWAYS_FILE, JSON.stringify(giveawayData, null, 2));
    log('Giveaway data saved');
  } catch (error) {
    logError('Error saving giveaway data:', error);
  }
}

/**
 * Initialize the giveaway service
 * Restores any active giveaways from saved data
 * @param {Object} client - Discord client
 */
async function initializeGiveawayService(client) {
  log('Initializing giveaway service');
  
  // Restore any active giveaways
  if (giveawayData.giveaways && giveawayData.giveaways.length > 0) {
    const now = Date.now();
    
    // Filter to only active giveaways
    const activeGiveawaysList = giveawayData.giveaways.filter(giveaway => 
      giveaway.endTime > now && !giveaway.hasEnded
    );
    
    // Restore each active giveaway
    for (const giveaway of activeGiveawaysList) {
      try {
        // Get the channel
        const channel = await client.channels.fetch(giveaway.channelId);
        if (!channel) continue;
        
        // Get the message
        const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (!message) continue;
        
        // Restore the giveaway
        activeGiveaways.set(giveaway.messageId, giveaway);
        
        // Start the countdown for this giveaway
        startCountdownTimer(giveaway.messageId, client);
        
        log(`Restored giveaway in ${channel.name}, ends in ${formatTimeRemaining(giveaway.endTime - now)}`);
      } catch (error) {
        logError(`Error restoring giveaway ${giveaway.messageId}:`, error);
      }
    }
    
    // Save the filtered list back
    giveawayData.giveaways = activeGiveawaysList;
    saveGiveawayData();
  }
  
  log('Giveaway service initialized');
  return true;
}

/**
 * Create a new giveaway
 * @param {Channel} channel - Discord channel to post the giveaway
 * @param {Object} options - Giveaway options
 * @param {User} creator - Discord user who created the giveaway
 * @returns {Promise<Object>} Created giveaway object
 */
async function createGiveaway(channel, options, creator) {
  try {
    const { prize, host, duration, emoji = '🎉' } = options;
    
    // Calculate end time
    const now = Date.now();
    const endTime = now + (duration * 60 * 1000); // Convert minutes to milliseconds
    
    // Create giveaway embed
    const embed = createGiveawayEmbed({
      prize,
      host,
      emoji,
      endTime,
      entrants: [],
      createdAt: now,
      creatorId: creator.id
    });
    
    // Create the actionRow with "Force End" button (only visible to creator)
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_end_${now}`)
          .setLabel('Force End Giveaway')
          .setStyle(ButtonStyle.Danger)
      );
    
    // Send the message
    const giveawayMessage = await channel.send({
      embeds: [embed],
      components: [actionRow]
    });
    
    // Add the reaction for entry
    await giveawayMessage.react(emoji);
    
    // Create giveaway object
    const giveawayObject = {
      messageId: giveawayMessage.id,
      channelId: channel.id,
      guildId: channel.guild.id,
      prize,
      host,
      emoji,
      creatorId: creator.id,
      createdAt: now,
      endTime,
      entrants: [],
      hasEnded: false,
      duration: duration
    };
    
    // Save the giveaway
    activeGiveaways.set(giveawayMessage.id, giveawayObject);
    giveawayData.giveaways.push(giveawayObject);
    saveGiveawayData();
    
    // Start the countdown
    startCountdownTimer(giveawayMessage.id, channel.client);
    
    return giveawayObject;
  } catch (error) {
    logError('Error creating giveaway:', error);
    throw error;
  }
}

/**
 * Create a giveaway embed
 * @param {Object} giveaway - Giveaway data
 * @returns {EmbedBuilder} Discord embed
 */
function createGiveawayEmbed(giveaway) {
  const timeRemaining = giveaway.endTime - Date.now();
  const entrantsCount = giveaway.entrants ? giveaway.entrants.length : 0;
  
  const embed = new EmbedBuilder()
    .setTitle(`🎉 GIVEAWAY: ${giveaway.prize}`)
    .setColor(timeRemaining > 0 ? 0x3498DB : 0xE74C3C) // Blue for active, red for ended
    .setDescription(`React with ${giveaway.emoji} to enter!`)
    .addFields(
      { name: 'Prize', value: giveaway.prize, inline: true },
      { name: 'Hosted by', value: giveaway.host, inline: true },
      { name: 'Entries', value: `${entrantsCount} entrant${entrantsCount !== 1 ? 's' : ''}`, inline: true },
      { name: 'Time Remaining', value: timeRemaining > 0 
        ? formatTimeRemaining(timeRemaining) 
        : '**GIVEAWAY ENDED**', inline: false }
    )
    .setFooter({ text: `Giveaway ID: ${giveaway.messageId ? giveaway.messageId.slice(-8) : 'New'}` })
    .setTimestamp(giveaway.endTime);
  
  // Add winner field if the giveaway has ended and has a winner
  if (giveaway.hasEnded && giveaway.winner) {
    embed.addFields({ name: 'Winner', value: `<@${giveaway.winner}>` });
    embed.setColor(0xF1C40F); // Gold for completed giveaway with winner
  }
  
  return embed;
}

/**
 * Format time remaining in a human-readable format
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} Formatted time
 */
function formatTimeRemaining(milliseconds) {
  // If less than 0, it's ended
  if (milliseconds <= 0) return '**GIVEAWAY ENDED**';
  
  // Convert to seconds, minutes, hours, days
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const minutes = Math.floor(milliseconds / (1000 * 60)) % 60;
  const hours = Math.floor(milliseconds / (1000 * 60 * 60)) % 24;
  const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
  
  // Build the string
  let timeString = '';
  if (days > 0) timeString += `**${days}** days, `;
  if (hours > 0 || days > 0) timeString += `**${hours}** hours, `;
  if (minutes > 0 || hours > 0 || days > 0) timeString += `**${minutes}** minutes, `;
  timeString += `**${seconds}** seconds`;
  
  return timeString;
}

/**
 * Start countdown timer for a giveaway
 * @param {string} messageId - Discord message ID for the giveaway
 * @param {Object} client - Discord client
 */
function startCountdownTimer(messageId, client) {
  // Clear any existing interval
  if (countdownIntervals.has(messageId)) {
    clearInterval(countdownIntervals.get(messageId));
  }
  
  // Set up the countdown interval (every second)
  const intervalId = setInterval(() => updateGiveaway(messageId, client), 1000);
  countdownIntervals.set(messageId, intervalId);
}

/**
 * Update a giveaway's display
 * @param {string} messageId - Discord message ID for the giveaway
 * @param {Object} client - Discord client
 */
async function updateGiveaway(messageId, client) {
  // Get the giveaway data
  const giveaway = activeGiveaways.get(messageId);
  if (!giveaway) {
    // Giveaway not found, clear the interval
    if (countdownIntervals.has(messageId)) {
      clearInterval(countdownIntervals.get(messageId));
      countdownIntervals.delete(messageId);
    }
    return;
  }
  
  try {
    // Check if it's time to end the giveaway
    const timeRemaining = giveaway.endTime - Date.now();
    
    // Get the channel
    const channel = await client.channels.fetch(giveaway.channelId);
    if (!channel) {
      throw new Error(`Channel ${giveaway.channelId} not found`);
    }
    
    // Get the message
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      throw new Error(`Message ${messageId} not found in channel ${giveaway.channelId}`);
    }
    
    if (timeRemaining <= 0 && !giveaway.hasEnded) {
      // Giveaway has ended, update it one last time
      await endGiveaway(messageId, client);
    } else if (!giveaway.hasEnded) {
      // Update the giveaway display
      // Only update every 5 seconds to reduce API calls, but always update on specific time boundaries
      const shouldUpdate = timeRemaining % 5000 <= 1000 || // Every 5 seconds
        timeRemaining <= 60000 && timeRemaining % 1000 <= 100; // Every second in the last minute
        
      if (shouldUpdate) {
        // Update the embed
        const updatedEmbed = createGiveawayEmbed(giveaway);
        await message.edit({ embeds: [updatedEmbed] });
      }
    }
  } catch (error) {
    logError(`Error updating giveaway ${messageId}:`, error);
    
    // If there was an error, we should clear the interval
    if (countdownIntervals.has(messageId)) {
      clearInterval(countdownIntervals.get(messageId));
      countdownIntervals.delete(messageId);
    }
  }
}

/**
 * End a giveaway and select a winner
 * @param {string} messageId - Discord message ID for the giveaway
 * @param {Object} client - Discord client
 * @param {boolean} forced - Whether the giveaway was forcibly ended
 */
async function endGiveaway(messageId, client, forced = false) {
  try {
    // Get the giveaway data
    const giveaway = activeGiveaways.get(messageId);
    if (!giveaway || giveaway.hasEnded) return;
    
    // Mark as ended
    giveaway.hasEnded = true;
    
    // Get the channel
    const channel = await client.channels.fetch(giveaway.channelId);
    if (!channel) {
      throw new Error(`Channel ${giveaway.channelId} not found`);
    }
    
    // Get the message
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      throw new Error(`Message ${messageId} not found in channel ${giveaway.channelId}`);
    }
    
    // Get all reactions
    const reaction = message.reactions.cache.get(giveaway.emoji);
    
    // Update entrants list
    giveaway.entrants = [];
    
    if (reaction) {
      // Fetch all users who reacted
      const users = await reaction.users.fetch();
      
      // Filter out the bot's reaction
      const entrants = users.filter(user => !user.bot).map(user => user.id);
      giveaway.entrants = entrants;
    }
    
    // Select a winner if there are entrants
    if (giveaway.entrants.length > 0) {
      const winnerIndex = Math.floor(Math.random() * giveaway.entrants.length);
      giveaway.winner = giveaway.entrants[winnerIndex];
      
      // Update the embed
      const updatedEmbed = createGiveawayEmbed(giveaway);
      await message.edit({ embeds: [updatedEmbed], components: [] });
      
      // Send the winner announcement
      await channel.send({
        content: `🎉 Congratulations <@${giveaway.winner}>! You've won the **${giveaway.prize}** giveaway hosted by ${giveaway.host}!`,
        allowedMentions: { users: [giveaway.winner] }
      });
    } else {
      // No entrants
      const updatedEmbed = createGiveawayEmbed(giveaway);
      await message.edit({ embeds: [updatedEmbed], components: [] });
      
      // Send the no winner announcement
      await channel.send({
        content: `😔 No one entered the **${giveaway.prize}** giveaway hosted by ${giveaway.host}. No winner was selected.`
      });
    }
    
    // Clear the interval
    if (countdownIntervals.has(messageId)) {
      clearInterval(countdownIntervals.get(messageId));
      countdownIntervals.delete(messageId);
    }
    
    // Update the giveaway data
    const giveawayIndex = giveawayData.giveaways.findIndex(g => g.messageId === messageId);
    if (giveawayIndex !== -1) {
      giveawayData.giveaways[giveawayIndex] = { ...giveaway };
      saveGiveawayData();
    }
    
    // Remove from active giveaways
    activeGiveaways.delete(messageId);
    
    log(`Giveaway ${messageId} ended. ${forced ? '(forced)' : ''} ${giveaway.winner ? `Winner: ${giveaway.winner}` : 'No winner'}`);
  } catch (error) {
    logError(`Error ending giveaway ${messageId}:`, error);
    
    // Clear the interval regardless
    if (countdownIntervals.has(messageId)) {
      clearInterval(countdownIntervals.get(messageId));
      countdownIntervals.delete(messageId);
    }
  }
}

/**
 * Handle a reaction add event for giveaways
 * @param {Object} reaction - Discord reaction
 * @param {Object} user - Discord user
 */
async function handleReactionAdd(reaction, user) {
  // Ignore bot reactions
  if (user.bot) return;
  
  // Check if this is a giveaway message
  const giveaway = activeGiveaways.get(reaction.message.id);
  if (!giveaway) return;
  
  // Check if the reaction matches the giveaway emoji
  if (reaction.emoji.name !== giveaway.emoji) return;
  
  // Check if the giveaway has ended
  if (giveaway.hasEnded) {
    // Remove the reaction if the giveaway has ended
    await reaction.users.remove(user.id).catch(() => {});
    return;
  }
  
  // Add the user to the entrants list if they're not already in it
  if (!giveaway.entrants.includes(user.id)) {
    giveaway.entrants.push(user.id);
    
    // Update the message embed with the new entrant count
    const updatedEmbed = createGiveawayEmbed(giveaway);
    await reaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
  }
}

/**
 * Handle a reaction remove event for giveaways
 * @param {Object} reaction - Discord reaction
 * @param {Object} user - Discord user
 */
async function handleReactionRemove(reaction, user) {
  // Ignore bot reactions
  if (user.bot) return;
  
  // Check if this is a giveaway message
  const giveaway = activeGiveaways.get(reaction.message.id);
  if (!giveaway) return;
  
  // Check if the reaction matches the giveaway emoji
  if (reaction.emoji.name !== giveaway.emoji) return;
  
  // Check if the giveaway has ended
  if (giveaway.hasEnded) return;
  
  // Remove the user from the entrants list
  giveaway.entrants = giveaway.entrants.filter(id => id !== user.id);
  
  // Update the message embed with the new entrant count
  const updatedEmbed = createGiveawayEmbed(giveaway);
  await reaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});
}

/**
 * Handle a button interaction for giveaways
 * @param {Object} interaction - Discord interaction
 */
async function handleGiveawayButton(interaction) {
  // Check if this is a giveaway button
  if (!interaction.customId.startsWith('giveaway_end_')) return false;
  
  // Get the giveaway message ID
  const messageId = interaction.message.id;
  
  // Get the giveaway data
  const giveaway = activeGiveaways.get(messageId);
  if (!giveaway) {
    await interaction.reply({
      content: 'This giveaway no longer exists.',
      ephemeral: true
    });
    return true;
  }
  
  // Check if the user is the creator of the giveaway
  if (interaction.user.id !== giveaway.creatorId) {
    await interaction.reply({
      content: 'Only the creator of this giveaway can end it.',
      ephemeral: true
    });
    return true;
  }
  
  // End the giveaway
  await interaction.reply({
    content: 'Ending the giveaway...',
    ephemeral: true
  });
  
  await endGiveaway(messageId, interaction.client, true);
  return true;
}

module.exports = {
  initializeGiveawayService,
  createGiveaway,
  endGiveaway,
  handleReactionAdd,
  handleReactionRemove,
  handleGiveawayButton
};
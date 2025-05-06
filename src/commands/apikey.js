const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const fs = require('fs');
const path = require('path');

// API key storage - would be better to use a database
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const USER_KEYS_FILE = path.join(DATA_DIR, 'user_keys.json');

// Make sure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize user keys storage
let userKeys = {};
try {
  if (fs.existsSync(USER_KEYS_FILE)) {
    userKeys = JSON.parse(fs.readFileSync(USER_KEYS_FILE, 'utf8'));
  } else {
    fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(userKeys), 'utf8');
  }
} catch (error) {
  logError('Error initializing user keys storage:', error);
}

// API key command - allows users to set their Torn API key
const apikeyCommand = {
  data: new SlashCommandBuilder()
    .setName('apikey')
    .setDescription('Manage your Torn API key for enhanced features'),
  
  async execute(interaction, client) {
    // Check if user has an API key stored
    const userKey = userKeys[interaction.user.id];
    const hasKey = !!userKey;
    
    // Create the API key management embed
    const embed = new EmbedBuilder()
      .setTitle('🔑 Torn API Key Management')
      .setColor(BOT_CONFIG.color)
      .setDescription('Your Torn API key allows the bot to fetch your personal stats and data.')
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
    
    if (hasKey) {
      // Add key status information to embed
      embed.addFields(
        { name: 'Status', value: '✅ API Key Set', inline: true },
        { name: 'Date Added', value: new Date(userKey.dateAdded).toLocaleString(), inline: true }
      );
      
      // Check key permissions if possible
      try {
        const response = await fetch(`https://api.torn.com/user/?selections=basic&key=${userKey.key}`);
        const data = await response.json();
        
        if (!data.error) {
          embed.addFields(
            { name: 'Connected Account', value: `${data.name} [${data.player_id}]`, inline: true },
            { name: 'Access Level', value: getUserAccessLevel(userKey.key), inline: true }
          );
        } else {
          embed.addFields(
            { name: 'Key Validation', value: `❌ Error: ${data.error.error}`, inline: true }
          );
        }
      } catch (error) {
        embed.addFields(
          { name: 'Key Validation', value: '❌ Could not verify key', inline: true }
        );
      }
    } else {
      // User doesn't have a key yet
      embed.addFields(
        { name: 'Status', value: '❌ No API Key Set', inline: true }
      );
      embed.setDescription(
        'Set up your Torn API key to use enhanced features like player stats tracking and growth monitoring. ' +
        'Your key is stored securely and only used to fetch data for you.'
      );
    }
    
    // Create the button row based on current status
    const row = new ActionRowBuilder();
    
    if (hasKey) {
      // User has a key - show update and remove buttons
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('apikey_update')
          .setLabel('Update API Key')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('apikey_remove')
          .setLabel('Remove API Key')
          .setStyle(ButtonStyle.Danger)
      );
    } else {
      // User doesn't have a key - show set button
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('apikey_set')
          .setLabel('Set API Key')
          .setStyle(ButtonStyle.Success)
      );
    }
    
    // Add help button regardless of status
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('apikey_help')
        .setLabel('How to Get an API Key')
        .setStyle(ButtonStyle.Secondary)
    );
    
    // Send the response
    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
    
    // Create a collector to handle button interactions
    const filter = i => i.user.id === interaction.user.id && i.customId.startsWith('apikey_');
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      // Handle the button interactions
      if (i.customId === 'apikey_set' || i.customId === 'apikey_update') {
        // Show API key input modal
        const modal = new ModalBuilder()
          .setCustomId('apikey_modal')
          .setTitle('Enter Your Torn API Key');
        
        const apiKeyInput = new TextInputBuilder()
          .setCustomId('apikey_input')
          .setLabel('Your Torn API Key')
          .setPlaceholder('Enter your 16-character API key here')
          .setStyle(TextInputStyle.Short)
          .setMinLength(16)
          .setMaxLength(16)
          .setRequired(true);
        
        const actionRow = new ActionRowBuilder().addComponents(apiKeyInput);
        modal.addComponents(actionRow);
        
        await i.showModal(modal);
        
        // Wait for modal submission
        try {
          const modalSubmission = await i.awaitModalSubmit({
            time: 120000, // 2 minutes to submit
            filter: i => i.customId === 'apikey_modal'
          });
          
          const apiKey = modalSubmission.fields.getTextInputValue('apikey_input');
          
          // Store the key
          userKeys[interaction.user.id] = {
            key: apiKey,
            dateAdded: new Date().toISOString()
          };
          
          fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(userKeys), 'utf8');
          
          // Send confirmation
          await modalSubmission.reply({
            content: '✅ Your API key has been securely stored! Run `/apikey` again to see its status.',
            ephemeral: true
          });
          
          log(`User ${interaction.user.tag} ${i.customId === 'apikey_set' ? 'set' : 'updated'} their API key`);
          
        } catch (error) {
          // Modal timed out or errored
          if (error.code === 'InteractionCollectorError') {
            log(`API key modal timed out for ${interaction.user.tag}`);
          } else {
            logError('Error in API key modal submission:', error);
          }
        }
      } 
      else if (i.customId === 'apikey_remove') {
        // Remove the API key
        if (userKeys[interaction.user.id]) {
          delete userKeys[interaction.user.id];
          fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(userKeys), 'utf8');
          
          await i.reply({
            content: '✅ Your API key has been removed from storage.',
            ephemeral: true
          });
          
          log(`User ${interaction.user.tag} removed their API key`);
        } else {
          await i.reply({
            content: '❓ You don\'t have an API key stored with this bot.',
            ephemeral: true
          });
        }
      }
      else if (i.customId === 'apikey_help') {
        // Show API key help
        const helpEmbed = new EmbedBuilder()
          .setTitle('📋 How to Get Your Torn API Key')
          .setColor(BOT_CONFIG.color)
          .setDescription(
            '1. Log in to [Torn](https://www.torn.com)\n' +
            '2. Go to Settings (gear icon in the top right)\n' +
            '3. Click on the "API Key" tab\n' +
            '4. Generate a new key with permissions for: `public, stats, battlestats, personalstats, profile`\n' +
            '5. Copy your key and use it with this bot\n\n' +
            'ℹ️ Your API key is kept private and is only used to fetch your data when you request it.'
          )
          .setFooter({ text: 'Never share your API key with people you don\'t trust' });
        
        await i.reply({
          embeds: [helpEmbed],
          ephemeral: true
        });
      }
    });
    
    collector.on('end', collected => {
      log(`API key button collector ended, ${collected.size} interactions processed`);
    });
  }
};

/**
 * Get user API key if stored
 * @param {string} userId - Discord user ID
 * @returns {string|null} API key or null if not found
 */
function getUserApiKey(userId) {
  const userKey = userKeys[userId];
  return userKey ? userKey.key : null;
}

/**
 * Determine the access level based on API key data from Torn API
 * @param {string} apiKey - Torn API key
 * @returns {string} Access level description
 */
async function checkApiKeyLevel(apiKey) {
  try {
    // Check the key's access level by trying various endpoints
    const response = await fetch(`https://api.torn.com/user/?selections=basic,battlestats,personalstats&key=${apiKey}`);
    const data = await response.json();
    
    if (data.error) {
      return `Limited: ${data.error.error}`;
    }
    
    // Check what data we can access
    const hasBasic = !!data.name;
    const hasBattlestats = (data.strength !== undefined);
    const hasPersonalstats = !!data.personalstats;
    
    if (hasBasic && hasBattlestats && hasPersonalstats) {
      return 'Full Access (User Stats)';
    } else if (hasBasic) {
      return 'Limited Access (Basic User Data)';
    } else {
      return 'Minimal Access';
    }
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Get a simple access level based on key pattern (used when API check fails)
 * @param {string} apiKey - Torn API key
 * @returns {string} Access level description
 */
function getUserAccessLevel(apiKey) {
  if (apiKey.length === 16) {
    return 'Standard API Key';
  }
  return 'Unknown Format';
}

module.exports = { 
  apikeyCommand,
  getUserApiKey 
};
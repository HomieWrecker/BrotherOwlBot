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

// Migrate old format to new format if needed
Object.keys(userKeys).forEach(userId => {
  if (typeof userKeys[userId] !== 'object' || userKeys[userId] === null) {
    return;
  }
  
  // If user has old format (single 'key' property)
  if (userKeys[userId].key && !userKeys[userId].torn) {
    userKeys[userId] = {
      torn: userKeys[userId].key,
      dateAdded: userKeys[userId].dateAdded || new Date().toISOString(),
    };
  }
});

// API key command - allows users to set their Torn API key and additional service keys
const apikeyCommand = {
  data: new SlashCommandBuilder()
    .setName('apikey')
    .setDescription('Manage your API keys for Torn and related services'),
  
  async execute(interaction, client) {
    // Check if user has API keys stored
    const userData = userKeys[interaction.user.id] || {};
    const hasTornKey = !!userData.torn;
    const hasYataKey = !!userData.yata;
    const hasTornStatsKey = !!userData.tornstats;
    
    // Create the API key management embed
    const embed = new EmbedBuilder()
      .setTitle('🔑 API Key Management')
      .setColor(BOT_CONFIG.color)
      .setDescription('Manage your API keys for Torn and related services.')
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
    
    // Torn API key status
    const tornKeyField = { name: 'Torn API Key', inline: false };
    if (hasTornKey) {
      try {
        const response = await fetch(`https://api.torn.com/user/?selections=basic&key=${userData.torn}`);
        const data = await response.json();
        
        if (!data.error) {
          tornKeyField.value = `✅ Connected to: **${data.name}** [${data.player_id}]\n` +
                              `Access Level: ${getUserAccessLevel(userData.torn)}\n` +
                              `Key: ${maskApiKey(userData.torn)}`;
        } else {
          tornKeyField.value = `⚠️ Stored but error: ${data.error.error}\n` +
                              `Key: ${maskApiKey(userData.torn)}`;
        }
      } catch (error) {
        tornKeyField.value = `⚠️ Stored but couldn't validate\n` +
                            `Key: ${maskApiKey(userData.torn)}`;
      }
    } else {
      tornKeyField.value = `❌ Not set - Required for most features`;
    }
    embed.addFields(tornKeyField);
    
    // YATA API key status
    const yataKeyField = { name: 'YATA API Key', inline: true };
    if (hasYataKey) {
      yataKeyField.value = `✓ Stored: ${maskApiKey(userData.yata)}`;
    } else {
      yataKeyField.value = '❌ Not set';
    }
    
    // TornStats API key status
    const tornStatsKeyField = { name: 'TornStats API Key', inline: true };
    if (hasTornStatsKey) {
      tornStatsKeyField.value = `✓ Stored: ${maskApiKey(userData.tornstats)}`;
    } else {
      tornStatsKeyField.value = '❌ Not set';
    }
    
    // Add additional API key fields
    embed.addFields(yataKeyField, tornStatsKeyField);
    
    // Create the primary button row
    const primaryRow = new ActionRowBuilder();
    primaryRow.addComponents(
      new ButtonBuilder()
        .setCustomId('apikey_torn')
        .setLabel(hasTornKey ? 'Update Torn API Key' : 'Set Torn API Key')
        .setStyle(hasTornKey ? ButtonStyle.Primary : ButtonStyle.Success)
    );
    
    // Create the secondary button row
    const secondaryRow = new ActionRowBuilder();
    secondaryRow.addComponents(
      new ButtonBuilder()
        .setCustomId('apikey_yata')
        .setLabel(hasYataKey ? 'Update YATA Key' : 'Set YATA Key')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('apikey_tornstats')
        .setLabel(hasTornStatsKey ? 'Update TornStats Key' : 'Set TornStats Key')
        .setStyle(ButtonStyle.Secondary)
    );
    
    // Create the utility button row
    const utilityRow = new ActionRowBuilder();
    utilityRow.addComponents(
      new ButtonBuilder()
        .setCustomId('apikey_help')
        .setLabel('Help & Info')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('apikey_remove')
        .setLabel('Remove All Keys')
        .setStyle(ButtonStyle.Danger)
    );
    
    // Send the response
    await interaction.reply({
      embeds: [embed],
      components: [primaryRow, secondaryRow, utilityRow],
      ephemeral: true
    });
    
    // Create a collector to handle button interactions
    const filter = i => i.user.id === interaction.user.id && i.customId.startsWith('apikey_');
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 300000 }); // 5 minute timeout
    
    collector.on('collect', async i => {
      // Handle the button interactions
      if (i.customId === 'apikey_torn') {
        // Show Torn API key input modal
        const modal = new ModalBuilder()
          .setCustomId('apikey_torn_modal')
          .setTitle('Enter Your Torn API Key');
        
        const apiKeyInput = new TextInputBuilder()
          .setCustomId('torn_key_input')
          .setLabel('Your Torn API Key')
          .setPlaceholder('Enter your 16-character API key here')
          .setStyle(TextInputStyle.Short)
          .setMinLength(16)
          .setMaxLength(16)
          .setRequired(true);
        
        const actionRow = new ActionRowBuilder().addComponents(apiKeyInput);
        modal.addComponents(actionRow);
        
        await i.showModal(modal);
      }
      else if (i.customId === 'apikey_yata') {
        // Show YATA API key input modal
        const modal = new ModalBuilder()
          .setCustomId('apikey_yata_modal')
          .setTitle('Enter Your YATA API Key');
        
        const apiKeyInput = new TextInputBuilder()
          .setCustomId('yata_key_input')
          .setLabel('Your YATA API Key')
          .setPlaceholder('Enter your YATA API key here')
          .setStyle(TextInputStyle.Short)
          .setMinLength(10)
          .setMaxLength(64)
          .setRequired(true);
        
        const actionRow = new ActionRowBuilder().addComponents(apiKeyInput);
        modal.addComponents(actionRow);
        
        await i.showModal(modal);
      }
      else if (i.customId === 'apikey_tornstats') {
        // Show TornStats API key input modal
        const modal = new ModalBuilder()
          .setCustomId('apikey_tornstats_modal')
          .setTitle('Enter Your TornStats API Key');
        
        const apiKeyInput = new TextInputBuilder()
          .setCustomId('tornstats_key_input')
          .setLabel('Your TornStats API Key')
          .setPlaceholder('Enter your TornStats API key here')
          .setStyle(TextInputStyle.Short)
          .setMinLength(10)
          .setMaxLength(64)
          .setRequired(true);
        
        const actionRow = new ActionRowBuilder().addComponents(apiKeyInput);
        modal.addComponents(actionRow);
        
        await i.showModal(modal);
      }
      else if (i.customId === 'apikey_remove') {
        // Remove all API keys
        if (userKeys[interaction.user.id]) {
          delete userKeys[interaction.user.id];
          fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(userKeys, null, 2), 'utf8');
          
          await i.reply({
            content: '✅ All your API keys have been removed from storage.',
            ephemeral: true
          });
          
          log(`User ${interaction.user.tag} removed all API keys`);
        } else {
          await i.reply({
            content: '❓ You don\'t have any API keys stored with this bot.',
            ephemeral: true
          });
        }
      }
      else if (i.customId === 'apikey_help') {
        // Show API key help
        const helpEmbed = new EmbedBuilder()
          .setTitle('📋 API Keys Information')
          .setColor(BOT_CONFIG.color)
          .setDescription(
            '**This bot can integrate with multiple Torn-related services:**\n\n' +
            '**Torn API Key** (Required)\n' +
            '1. Log in to [Torn](https://www.torn.com)\n' +
            '2. Go to Settings (gear icon in the top right)\n' +
            '3. Click on the "API Key" tab\n' +
            '4. Generate a new key with permissions for: `public, stats, battlestats, personalstats, profile`\n\n' +
            '**YATA API Key** (Optional)\n' +
            '1. Log in to [YATA](https://yata.yt)\n' +
            '2. Go to your Profile\n' +
            '3. Find the "API Keys" section\n' +
            '4. Copy your key or generate a new one\n\n' +
            '**TornStats API Key** (Optional)\n' +
            '1. Log in to [TornStats](https://tornstats.com)\n' +
            '2. Go to your Settings\n' +
            '3. Find the "API Key" section\n' +
            '4. Copy your key or generate a new one\n\n' +
            '**All keys are kept private** and are only used to fetch your data when you request it.'
          )
          .setFooter({ text: 'Never share your API keys with people you don\'t trust' });
        
        await i.reply({
          embeds: [helpEmbed],
          ephemeral: true
        });
      }
    });
    
    collector.on('end', collected => {
      log(`API key button collector ended, ${collected.size} interactions processed`);
    });
  },
  
  /**
   * Handle modal submissions for apikey command
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   * @param {Client} client - Discord client
   */
  async handleModal(interaction, client) {
    const userId = interaction.user.id;
    
    if (interaction.customId === 'apikey_torn_modal') {
      const tornKey = interaction.fields.getTextInputValue('torn_key_input');
      
      try {
        // Validate the key
        const accessLevel = await checkApiKeyLevel(tornKey);
        
        // Ensure user has a storage object
        if (!userKeys[userId]) {
          userKeys[userId] = {};
        }
        
        // Store the key
        userKeys[userId].torn = tornKey;
        userKeys[userId].dateAdded = new Date().toISOString();
        fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(userKeys, null, 2), 'utf8');
        
        await interaction.reply({
          content: `✅ Your Torn API key has been successfully saved! Access level: ${accessLevel}`,
          ephemeral: true
        });
        
        log(`User ${interaction.user.tag} set their Torn API key`);
      } catch (error) {
        // If we can't validate with the API, do a basic pattern check
        const simpleAccessLevel = getUserAccessLevel(tornKey);
        
        if (simpleAccessLevel !== 'Invalid Format') {
          // Store the key anyway
          if (!userKeys[userId]) {
            userKeys[userId] = {};
          }
          userKeys[userId].torn = tornKey;
          userKeys[userId].dateAdded = new Date().toISOString();
          fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(userKeys, null, 2), 'utf8');
          
          await interaction.reply({
            content: `⚠️ Your Torn API key has been saved, but I couldn't validate it. Estimated access level: ${simpleAccessLevel}`,
            ephemeral: true
          });
          
          log(`User ${interaction.user.tag} set their Torn API key (unvalidated)`);
        } else {
          await interaction.reply({
            content: '❌ Invalid API key format. Please check your key and try again.',
            ephemeral: true
          });
        }
      }
    }
    else if (interaction.customId === 'apikey_yata_modal') {
      const yataKey = interaction.fields.getTextInputValue('yata_key_input');
      
      // Ensure user has a storage object
      if (!userKeys[userId]) {
        userKeys[userId] = {};
      }
      
      // Store the key
      userKeys[userId].yata = yataKey;
      fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(userKeys, null, 2), 'utf8');
      
      await interaction.reply({
        content: '✅ Your YATA API key has been successfully saved!',
        ephemeral: true
      });
      
      log(`User ${interaction.user.tag} set their YATA API key`);
    }
    else if (interaction.customId === 'apikey_tornstats_modal') {
      const tornstatsKey = interaction.fields.getTextInputValue('tornstats_key_input');
      
      // Ensure user has a storage object
      if (!userKeys[userId]) {
        userKeys[userId] = {};
      }
      
      // Store the key
      userKeys[userId].tornstats = tornstatsKey;
      fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(userKeys, null, 2), 'utf8');
      
      await interaction.reply({
        content: '✅ Your TornStats API key has been successfully saved!',
        ephemeral: true
      });
      
      log(`User ${interaction.user.tag} set their TornStats API key`);
    }
  }
};

/**
 * Get user API key if stored
 * @param {string} userId - Discord user ID
 * @param {string} keyType - Type of API key to get ('torn', 'yata', 'tornstats')
 * @returns {string|null} API key or null if not found
 */
function getUserApiKey(userId, keyType = 'torn') {
  const userData = userKeys[userId];
  if (!userData) {
    return null;
  }
  
  // Handle old format for backward compatibility
  if (keyType === 'torn' && userData.key && !userData.torn) {
    return userData.key;
  }
  
  return userData[keyType] || null;
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
  if (!apiKey || typeof apiKey !== 'string') {
    return 'Invalid Format';
  }
  
  if (apiKey.length === 16) {
    return 'Standard API Key';
  }
  return 'Unknown Format';
}

/**
 * Mask API key for display
 * @param {string} apiKey - API key to mask
 * @returns {string} Masked API key
 */
function maskApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return '';
  }
  
  if (apiKey.length <= 8) {
    return '****' + apiKey.slice(-4);
  }
  
  return apiKey.slice(0, 4) + '****' + apiKey.slice(-4);
}

module.exports = { 
  apikeyCommand,
  getUserApiKey 
};
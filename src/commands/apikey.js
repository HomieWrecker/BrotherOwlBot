const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const keyStorageService = require('../services/key-storage-service');

// API key command - allows users to set their Torn API key and TornStats API key
const apikeyCommand = {
  data: new SlashCommandBuilder()
    .setName('apikey')
    .setDescription('Manage your API keys for Torn and related services'),
  
  /**
   * Handle the slash command execution
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    // Get user's stored API keys
    let tornKey = null;
    let tornStatsKey = null;
    
    try {
      tornKey = await keyStorageService.getApiKey(interaction.user.id, 'torn');
      tornStatsKey = await keyStorageService.getApiKey(interaction.user.id, 'tornstats');
    } catch (error) {
      logError('Error retrieving API keys:', error);
    }
    
    const hasTornKey = !!tornKey;
    const hasTornStatsKey = !!tornStatsKey;
    
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
        const response = await fetch(`https://api.torn.com/user/?selections=basic&key=${tornKey}`);
        const data = await response.json();
        
        if (!data.error) {
          tornKeyField.value = `✅ Connected to: **${data.name}** [${data.player_id}]\n` +
                              `Access Level: ${await getUserAccessLevel(tornKey)}\n` +
                              `Key: ${maskApiKey(tornKey)}`;
        } else {
          tornKeyField.value = `⚠️ Stored but error: ${data.error.error}\n` +
                              `Key: ${maskApiKey(tornKey)}`;
        }
      } catch (error) {
        tornKeyField.value = `⚠️ Stored but couldn't validate\n` +
                            `Key: ${maskApiKey(tornKey)}`;
      }
    } else {
      tornKeyField.value = `❌ Not set - Required for most features`;
    }
    embed.addFields(tornKeyField);
    
    // TornStats API key status
    const tornStatsKeyField = { name: 'TornStats API Key', inline: true };
    if (hasTornStatsKey) {
      tornStatsKeyField.value = `✓ Stored: ${maskApiKey(tornStatsKey)}`;
    } else {
      tornStatsKeyField.value = '❌ Not set';
    }
    
    // Add API key fields
    embed.addFields(tornStatsKeyField);
    
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
        try {
          await keyStorageService.deleteAllKeys(interaction.user.id);
          await i.reply({
            content: '✅ All your API keys have been removed from storage.',
            ephemeral: true
          });
          log(`User ${interaction.user.tag} removed all API keys`);
        } catch (error) {
          logError(`Error removing API keys for user ${interaction.user.tag}:`, error);
          await i.reply({
            content: '❌ There was an error removing your API keys. Please try again later.',
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
            '**This bot can integrate with Torn and TornStats:**\n\n' +
            '**Torn API Key** (Required)\n' +
            '1. Log in to [Torn](https://www.torn.com)\n' +
            '2. Go to Settings (gear icon in the top right)\n' +
            '3. Click on the "API Key" tab\n' +
            '4. Generate a new key with permissions for: `public, stats, battlestats, personalstats, profile`\n\n' +
            '**TornStats API Key** (Optional)\n' +
            '1. Log in to [TornStats](https://tornstats.com)\n' +
            '2. Go to your Settings\n' +
            '3. Find the "API Key" section\n' +
            '4. Copy your key or generate a new one\n' +
            '5. Make sure your key starts with "TS_" (the bot will add this prefix if missing)\n\n' +
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
   * Handle button interactions for apikey command
   * @param {ButtonInteraction} interaction - Button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    // This method is called from bot.js when an API key-related button is clicked
    // All our button handling code is already in the execute method
    // This is just a placeholder to satisfy the interface
    if (!interaction.replied) {
      await interaction.deferUpdate().catch(error => {
        logError('Error deferring button update:', error);
      });
    }
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
        
        // Store the key
        await keyStorageService.storeApiKey(userId, 'torn', tornKey);
        
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
          try {
            await keyStorageService.storeApiKey(userId, 'torn', tornKey);
            
            await interaction.reply({
              content: `⚠️ Your Torn API key has been saved, but I couldn't validate it. Estimated access level: ${simpleAccessLevel}`,
              ephemeral: true
            });
            
            log(`User ${interaction.user.tag} set their Torn API key (unvalidated)`);
          } catch (storeError) {
            logError(`Error storing API key for user ${interaction.user.tag}:`, storeError);
            await interaction.reply({
              content: '❌ There was an error saving your API key. Please try again later.',
              ephemeral: true
            });
          }
        } else {
          await interaction.reply({
            content: '❌ Invalid API key format. Please check your key and try again.',
            ephemeral: true
          });
        }
      }
    }
    else if (interaction.customId === 'apikey_tornstats_modal') {
      const tornStatsKey = interaction.fields.getTextInputValue('tornstats_key_input');
      
      // Add TS_ prefix if missing
      let formattedKey = tornStatsKey;
      if (!formattedKey.startsWith('TS_')) {
        formattedKey = `TS_${formattedKey}`;
      }
      
      try {
        // Store the key
        await keyStorageService.storeApiKey(userId, 'tornstats', formattedKey);
        
        await interaction.reply({
          content: `✅ Your TornStats API key has been successfully saved!`,
          ephemeral: true
        });
        
        log(`User ${interaction.user.tag} set their TornStats API key`);
      } catch (error) {
        logError(`Error storing TornStats API key for user ${interaction.user.tag}:`, error);
        await interaction.reply({
          content: '❌ There was an error saving your TornStats API key. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};

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

module.exports = apikeyCommand;
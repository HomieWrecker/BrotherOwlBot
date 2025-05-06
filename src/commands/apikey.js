const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
    .setDescription('Set or manage your Torn API key')
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set your Torn API key (DM only for security)')
        .addStringOption(option =>
          option
            .setName('key')
            .setDescription('Your Torn API key')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Check if you have an API key stored'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove your stored API key'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('permissions')
        .setDescription('Check your API key permissions')),
  
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    
    // Handle set subcommand
    if (subcommand === 'set') {
      // For security, only allow API key to be set via DM
      if (!interaction.channel.isDMBased()) {
        return interaction.reply({
          content: '⚠️ For security reasons, please use this command in a DM with me.',
          ephemeral: true
        });
      }
      
      const apiKey = interaction.options.getString('key');
      
      // Validate API key (simple validation)
      if (apiKey.length !== 16) {
        return interaction.reply({
          content: '❌ Invalid API key format. Please check your key and try again.',
          ephemeral: true
        });
      }
      
      // Store the API key
      try {
        userKeys[interaction.user.id] = {
          key: apiKey,
          dateAdded: new Date().toISOString()
        };
        
        fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(userKeys), 'utf8');
        
        // Acknowledge success
        await interaction.reply({
          content: '✅ Your API key has been stored securely. Use `/apikey permissions` to check what data the bot can access.',
          ephemeral: true
        });
        
        log(`User ${interaction.user.tag} set their API key`);
      } catch (error) {
        logError('Error storing API key:', error);
        await interaction.reply({
          content: '❌ There was an error storing your API key. Please try again later.',
          ephemeral: true
        });
      }
    }
    
    // Handle check subcommand
    else if (subcommand === 'check') {
      const userKey = userKeys[interaction.user.id];
      
      if (userKey) {
        const embed = new EmbedBuilder()
          .setTitle('🔑 API Key Status')
          .setColor(BOT_CONFIG.color)
          .setDescription('You have an API key stored with the bot.')
          .addFields(
            { name: 'Date Added', value: new Date(userKey.dateAdded).toLocaleString(), inline: true }
          )
          .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({
          content: '❌ You don\'t have an API key stored. Use `/apikey set` to add your key.',
          ephemeral: true
        });
      }
    }
    
    // Handle remove subcommand
    else if (subcommand === 'remove') {
      if (userKeys[interaction.user.id]) {
        delete userKeys[interaction.user.id];
        fs.writeFileSync(USER_KEYS_FILE, JSON.stringify(userKeys), 'utf8');
        await interaction.reply({
          content: '✅ Your API key has been removed from storage.',
          ephemeral: true
        });
        log(`User ${interaction.user.tag} removed their API key`);
      } else {
        await interaction.reply({
          content: '❓ You don\'t have an API key stored with this bot.',
          ephemeral: true
        });
      }
    }
    
    // Handle permissions subcommand 
    else if (subcommand === 'permissions') {
      const userKey = userKeys[interaction.user.id];
      
      if (!userKey) {
        return interaction.reply({
          content: '❌ You don\'t have an API key stored. Use `/apikey set` to add your key.',
          ephemeral: true
        });
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      try {
        // Check API key permissions via Torn API
        const response = await fetch(`https://api.torn.com/user/?selections=basic&key=${userKey.key}`);
        const data = await response.json();
        
        if (data.error) {
          return interaction.editReply({
            content: `❌ Error checking API key: ${data.error.error}`
          });
        }
        
        // Create permission embed
        const embed = new EmbedBuilder()
          .setTitle('🔑 API Key Permissions')
          .setColor(BOT_CONFIG.color)
          .setDescription(`API key verified for user: **${data.name}** [${data.player_id}]`)
          .addFields(
            { name: 'Access Level', value: getUserAccessLevel(userKey.key), inline: true },
            { name: 'Date Added', value: new Date(userKey.dateAdded).toLocaleString(), inline: true }
          )
          .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
        
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logError('Error checking API key permissions:', error);
        await interaction.editReply({
          content: '❌ There was an error checking your API key permissions. Please try again later.'
        });
      }
    }
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
 * Determine the access level based on API key (simplified version)
 * @param {string} apiKey - Torn API key
 * @returns {string} Access level description
 */
function getUserAccessLevel(apiKey) {
  // In a real implementation, we would query the API to check permissions
  // This is a placeholder that examines the key format for demonstration
  if (apiKey.length === 16) {
    return 'Limited Access (Basic User Data)';
  }
  return 'Unknown';
}

module.exports = { 
  apikeyCommand,
  getUserApiKey 
};
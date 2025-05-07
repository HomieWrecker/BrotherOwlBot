/**
 * TornStats API Key Command for BrotherOwlManager
 * 
 * This command allows faction admins to set/update the TornStats API key
 * used by the bot for accessing TornStats data.
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getUserApiKey } = require('./apikey');

// Create the command
module.exports = {
  data: new SlashCommandBuilder()
    .setName('tornstats-api')
    .setDescription('Set or update the TornStats API key used by the bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Update the TornStats API key'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check the status of the TornStats API integration')),

  /**
   * Execute command
   * @param {CommandInteraction} interaction - Discord interaction object
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    // Check if the user has permission to use this command
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'You need Administrator permission to manage API keys.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'update') {
      await handleUpdateSubcommand(interaction, client);
    } else if (subcommand === 'status') {
      await handleStatusSubcommand(interaction, client);
    }
  },

  /**
   * Handle modal submissions for tornstats-api command
   * @param {ModalSubmitInteraction} interaction - Modal interaction
   * @param {Client} client - Discord client
   */
  async handleModal(interaction, client) {
    if (interaction.customId === 'tornstats-api-modal') {
      const apiKey = interaction.fields.getTextInputValue('tornstats-api-input');
      
      // Validate API key format (basic check)
      if (!apiKey || apiKey.length < 8) {
        return interaction.reply({
          content: 'Invalid API key format. Please provide a valid TornStats API key.',
          ephemeral: true
        });
      }
      
      try {
        // Store API key in environment variable
        process.env.TORNSTATS_API_KEY = apiKey;
        
        // Test the API key to make sure it works
        const testResult = await testTornStatsApiKey(apiKey);
        
        const embed = new EmbedBuilder()
          .setTitle('TornStats API Key Update')
          .setColor(testResult.success ? '#00FF00' : '#FFAA00')
          .setDescription(testResult.message)
          .setTimestamp();
          
        interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
        
      } catch (error) {
        console.error('Error updating TornStats API key:', error);
        interaction.reply({
          content: `Error updating TornStats API key: ${error.message}`,
          ephemeral: true
        });
      }
    }
  },
  
  /**
   * Handle button interactions for this command
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    if (interaction.customId === 'tornstats-api-verify') {
      // Verify current TornStats API integration
      const testResult = await testTornStatsApiKey(process.env.TORNSTATS_API_KEY);
      
      const embed = new EmbedBuilder()
        .setTitle('TornStats API Verification')
        .setColor(testResult.success ? '#00FF00' : '#FFAA00')
        .setDescription(testResult.message)
        .setTimestamp();
        
      interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }
  }
};

/**
 * Handle the update subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleUpdateSubcommand(interaction, client) {
  // Create a modal to accept the API key
  const modal = new ModalBuilder()
    .setCustomId('tornstats-api-modal')
    .setTitle('Update TornStats API Key');
    
  // Add inputs to the modal
  const apiKeyInput = new TextInputBuilder()
    .setCustomId('tornstats-api-input')
    .setLabel('TornStats API Key')
    .setPlaceholder('Enter your TornStats API key here...')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
    
  // Add input to modal
  const firstActionRow = new ActionRowBuilder().addComponents(apiKeyInput);
  modal.addComponents(firstActionRow);
  
  // Show the modal
  await interaction.showModal(modal);
}

/**
 * Handle the status subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleStatusSubcommand(interaction, client) {
  const apiKey = process.env.TORNSTATS_API_KEY;
  
  // Check if the API key exists
  if (!apiKey) {
    const embed = new EmbedBuilder()
      .setTitle('TornStats API Status')
      .setColor('#FF0000')
      .setDescription('No TornStats API key is currently set. Use `/tornstats-api update` to set one.')
      .setTimestamp();
      
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
  
  // Create a verify button
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tornstats-api-verify')
      .setLabel('Verify API Key')
      .setStyle(ButtonStyle.Primary)
  );
  
  // Mask the API key for display
  const maskedKey = maskApiKey(apiKey);
  
  const embed = new EmbedBuilder()
    .setTitle('TornStats API Status')
    .setColor('#0099FF')
    .setDescription(`Current TornStats API key: \`${maskedKey}\`\n\nClick the button below to verify the API key.`)
    .setTimestamp();
    
  interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

/**
 * Mask API key for display
 * @param {string} apiKey - API key to mask
 * @returns {string} Masked API key
 */
function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 8) return 'Invalid Key Format';
  return apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
}

/**
 * Test TornStats API key
 * @param {string} apiKey - TornStats API key to test
 * @returns {Promise<{success: boolean, message: string}>} Test result
 */
async function testTornStatsApiKey(apiKey) {
  if (!apiKey) {
    return { success: false, message: 'No API key provided.' };
  }
  
  try {
    // Try to make a basic API request to check if the key works
    const fetch = require('node-fetch');
    
    // Test URL format from TornStats API docs (basic check)
    const testUrl = `https://www.tornstats.com/api/v1/${apiKey}`;
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'BrotherOwlManager/1.0',
        'Accept': 'application/json'
      }
    });
    
    // Check if the response is valid
    if (response.status === 200) {
      try {
        const data = await response.json();
        return { 
          success: true, 
          message: 'TornStats API key is valid and working properly!' 
        };
      } catch (e) {
        return { 
          success: false, 
          message: 'API key may be invalid. The response was not valid JSON.' 
        };
      }
    } else if (response.status === 403 || response.status === 401) {
      return { 
        success: false, 
        message: 'API key is invalid or unauthorized.' 
      };
    } else {
      return { 
        success: false, 
        message: `API check failed with status ${response.status}. This could be due to API changes or maintenance.` 
      };
    }
    
  } catch (error) {
    console.error('Error testing TornStats API key:', error);
    return { 
      success: false, 
      message: `Error testing API key: ${error.message}` 
    };
  }
}
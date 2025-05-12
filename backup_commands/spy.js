const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { 
  getSpyData, 
  addSpyData, 
  estimatePrimaryStat, 
  estimateTotalStats, 
  getStatConfidence,
  formatStatsForDisplay,
  getRecommendation,
  getConfidenceColor,
  getRecommendationColor
} = require('../utils/stats_bridge');

/**
 * Convert a number to a formatted string with commas
 * @param {number} num - The number to format
 * @returns {string} The formatted number
 */
function formatNumber(num) {
  return num ? num.toLocaleString() : '0';
}

/**
 * Parse a player ID from various input formats
 * @param {string} input - Player input (ID, name, or URL)
 * @returns {string|null} Player ID or null if not found
 */
function parsePlayerId(input) {
  if (!input) return null;
  
  // Match pure numeric IDs
  if (/^\d+$/.test(input)) {
    return input;
  }
  
  // Match profile URLs
  const urlMatch = input.match(/torn\.com\/profiles\.php\?XID=(\d+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  // For other formats, we'll need to look up the player
  // This would require an API call, so we'll assume it's not an ID
  return null;
}

// Define the spy command
const spyCommand = {
  data: new SlashCommandBuilder()
    .setName('spy')
    .setDescription('Get battle statistics for a Torn player')
    .addSubcommand(subcommand =>
      subcommand
        .setName('lookup')
        .setDescription('Look up a player\'s battle stats')
        .addStringOption(option =>
          option
            .setName('player_id')
            .setDescription('Torn ID of the player to look up')
            .setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add spy data for a player')
        .addStringOption(option =>
          option
            .setName('player_id')
            .setDescription('Torn ID of the player')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('strength')
            .setDescription('Player\'s strength stat')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('speed')
            .setDescription('Player\'s speed stat')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('dexterity')
            .setDescription('Player\'s dexterity stat')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('defense')
            .setDescription('Player\'s defense stat')
            .setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('estimate')
        .setDescription('Estimate a player\'s stats based on battle performance')
        .addStringOption(option =>
          option
            .setName('player_id')
            .setDescription('Torn ID of the player')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('damage')
            .setDescription('Damage dealt in the battle')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('turns')
            .setDescription('Number of turns in the battle')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('my_primary')
            .setDescription('Your primary stat value')
            .setRequired(true))
    ),

  /**
   * Execute the spy command
   * @param {Object} interaction - Discord interaction
   * @param {Object} client - Discord client
   */
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    
    // Handle each subcommand
    if (subcommand === 'lookup') {
      await handleLookupSubcommand(interaction);
    } else if (subcommand === 'add') {
      await handleAddSubcommand(interaction);
    } else if (subcommand === 'estimate') {
      await handleEstimateSubcommand(interaction);
    }
  }
};

/**
 * Handle the lookup subcommand
 * @param {Object} interaction - Discord interaction
 */
async function handleLookupSubcommand(interaction) {
  await interaction.deferReply();
  
  try {
    // Get player ID from options
    const playerInput = interaction.options.getString('player_id');
    const playerId = parsePlayerId(playerInput);
    
    if (!playerId) {
      return interaction.editReply(`Could not parse a valid player ID from "${playerInput}"`);
    }
    
    // Get spy data if it exists
    const spyData = getSpyData(playerId);
    
    if (spyData) {
      // We have spy data
      const confidence = getStatConfidence(spyData);
      const formattedData = formatStatsForDisplay(playerId, spyData, confidence);
      
      const embed = new EmbedBuilder()
        .setTitle(formattedData.title)
        .setColor(getConfidenceColor(confidence));
      
      // Add fields from formatted data
      formattedData.fields.forEach(field => {
        embed.addFields({ name: field.name, value: field.value, inline: field.inline });
      });
      
      // Add timestamp and footer
      embed.setTimestamp()
        .setFooter({ text: `Data confidence: ${confidence.toUpperCase()}` });
      
      return interaction.editReply({ embeds: [embed] });
    } else {
      // No spy data
      const embed = new EmbedBuilder()
        .setTitle(`No Spy Data for Player ${playerId}`)
        .setDescription(
          `No spy data found for this player. You can:\n` +
          `• Use \`/spy add\` to add spy data manually\n` +
          `• Use \`/spy estimate\` to estimate stats based on battle performance`
        )
        .setColor(0x808080);
      
      return interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    logError('Error in spy lookup command:', error);
    return interaction.editReply('There was an error processing your request. Please try again later.');
  }
}

/**
 * Handle the add subcommand
 * @param {Object} interaction - Discord interaction
 */
async function handleAddSubcommand(interaction) {
  await interaction.deferReply();
  
  try {
    // Get options
    const playerInput = interaction.options.getString('player_id');
    const playerId = parsePlayerId(playerInput);
    
    if (!playerId) {
      return interaction.editReply(`Could not parse a valid player ID from "${playerInput}"`);
    }
    
    const strength = interaction.options.getInteger('strength');
    const speed = interaction.options.getInteger('speed');
    const dexterity = interaction.options.getInteger('dexterity');
    const defense = interaction.options.getInteger('defense');
    
    // Add the spy data
    const spyData = addSpyData(playerId, strength, speed, dexterity, defense);
    
    // Create response embed
    const confidence = getStatConfidence(spyData);
    const formattedData = formatStatsForDisplay(playerId, spyData, confidence);
    
    const embed = new EmbedBuilder()
      .setTitle(`Spy Data Added for Player ${playerId}`)
      .setColor(getConfidenceColor(confidence));
    
    // Add fields from formatted data
    formattedData.fields.forEach(field => {
      embed.addFields({ name: field.name, value: field.value, inline: field.inline });
    });
    
    // Add timestamp and footer
    embed.setTimestamp()
      .setFooter({ text: `Added by ${interaction.user.tag}` });
    
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logError('Error in spy add command:', error);
    return interaction.editReply('There was an error processing your request. Please try again later.');
  }
}

/**
 * Handle the estimate subcommand
 * @param {Object} interaction - Discord interaction
 */
async function handleEstimateSubcommand(interaction) {
  await interaction.deferReply();
  
  try {
    // Get options
    const playerInput = interaction.options.getString('player_id');
    const playerId = parsePlayerId(playerInput);
    
    if (!playerId) {
      return interaction.editReply(`Could not parse a valid player ID from "${playerInput}"`);
    }
    
    const damage = interaction.options.getInteger('damage');
    const turns = interaction.options.getInteger('turns');
    const myPrimary = interaction.options.getInteger('my_primary');
    
    // Calculate estimates
    const primaryEstimate = estimatePrimaryStat(damage, turns, myPrimary);
    const totalEstimate = estimateTotalStats(primaryEstimate);
    
    if (!primaryEstimate) {
      return interaction.editReply('Could not estimate stats with the provided values. Please ensure damage and turns are positive numbers.');
    }
    
    // Create the estimated data
    const estimatedData = {
      primary: primaryEstimate,
      total: totalEstimate
    };
    
    // Format for display
    const formattedData = formatStatsForDisplay(playerId, estimatedData, 'low');
    
    const embed = new EmbedBuilder()
      .setTitle(formattedData.title)
      .setColor(getConfidenceColor('low'));
    
    // Add fields from formatted data
    formattedData.fields.forEach(field => {
      embed.addFields({ name: field.name, value: field.value, inline: field.inline });
    });
    
    // Add calculation details
    embed.addFields({
      name: 'Calculation Details',
      value: `Based on ${formatNumber(damage)} damage over ${turns} turns with your ${formatNumber(myPrimary)} primary stat`,
      inline: false
    });
    
    // Add recommendation
    const myTotalStats = myPrimary * 4; // Rough estimate of total stats
    const recommendation = getRecommendation(myTotalStats, totalEstimate);
    
    embed.addFields({
      name: 'Battle Recommendation',
      value: recommendation.toUpperCase(),
      inline: true
    });
    
    // Add timestamp and footer
    embed.setTimestamp()
      .setFooter({ text: 'This is only an estimate. Actual stats may vary.' });
    
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logError('Error in spy estimate command:', error);
    return interaction.editReply('There was an error processing your request. Please try again later.');
  }
}

module.exports = { spyCommand };
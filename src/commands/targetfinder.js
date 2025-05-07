/**
 * Target Finder command for BrotherOwlManager
 * Locates potential targets based on battle stats and fair fight bonus potential
 * 
 * This command leverages the battlestats-tracker for enhanced stats when available
 * and falls back to direct API calls when necessary.
 */

const { 
  SlashCommandBuilder, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  Colors
} = require('discord.js');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const { findPotentialTargets, calculateTotalBattleStats, calculateWinProbability, calculateFairFightBonus } = require('../utils/torn-scraper');
const { getUserApiKey } = require('./apikey').apikeyCommand;

// Try to get the battle stats tracker if available
let battleStatsTracker = null;
try {
  const battleStatsTrackerService = require('../services/battlestats-tracker');
  if (battleStatsTrackerService && typeof battleStatsTrackerService.getPlayerStats === 'function') {
    battleStatsTracker = battleStatsTrackerService;
    log('BattleStats tracker loaded for targetfinder command integration');
  }
} catch (error) {
  logError('Error loading battlestats-tracker for targetfinder command:', error);
  // Continue without the tracker - we'll use direct API calls instead
}

// Create a command builder for the targetfinder command
const targetfinderCommand = {
  data: new SlashCommandBuilder()
    .setName('targetfinder')
    .setDescription('Find potential targets based on your battle stats')
    .addIntegerOption(option =>
      option.setName('max_results')
        .setDescription('Maximum number of targets to find (1-25)')
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false))
    .addNumberOption(option =>
      option.setName('min_fairfight')
        .setDescription('Minimum fair fight bonus (0.25-3.00)')
        .setMinValue(0.25)
        .setMaxValue(3.00)
        .setRequired(false))
    .addNumberOption(option =>
      option.setName('min_win_chance')
        .setDescription('Minimum win probability (0.0-1.0)')
        .setMinValue(0)
        .setMaxValue(1)
        .setRequired(false)),

  /**
   * Execute command with safe error handling
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    try {
      // Safely execute the command with proper error isolation
      return await safeExecuteCommand(interaction, client);
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error executing targetfinder command (protected):', error);
      
      // Handle errors in responding to the interaction
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ There was an error finding targets. This error has been logged and will not affect other bot functionality.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.followUp({
            content: '❌ There was an error finding targets. This error has been logged and will not affect other bot functionality.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending targetfinder command error reply:', replyError);
      }
    }
  },
  
  /**
   * Handle button interactions for targetfinder
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    try {
      if (interaction.customId === 'targetfinder_manual_stats') {
        // Create a modal for manual stat input
        const modal = new ModalBuilder()
          .setCustomId('targetfinder_stats_modal')
          .setTitle('Enter Your Battle Stats');
        
        // Add input fields for each stat
        const strengthInput = new TextInputBuilder()
          .setCustomId('stat_strength')
          .setLabel('Strength')
          .setPlaceholder('Enter your strength stat (e.g. 10000)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
          
        const defenseInput = new TextInputBuilder()
          .setCustomId('stat_defense')
          .setLabel('Defense')
          .setPlaceholder('Enter your defense stat (e.g. 10000)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
          
        const speedInput = new TextInputBuilder()
          .setCustomId('stat_speed')
          .setLabel('Speed')
          .setPlaceholder('Enter your speed stat (e.g. 10000)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
          
        const dexterityInput = new TextInputBuilder()
          .setCustomId('stat_dexterity')
          .setLabel('Dexterity')
          .setPlaceholder('Enter your dexterity stat (e.g. 10000)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        // Add all inputs to the modal
        const strengthRow = new ActionRowBuilder().addComponents(strengthInput);
        const defenseRow = new ActionRowBuilder().addComponents(defenseInput);
        const speedRow = new ActionRowBuilder().addComponents(speedInput);
        const dexterityRow = new ActionRowBuilder().addComponents(dexterityInput);
        
        modal.addComponents(strengthRow, defenseRow, speedRow, dexterityRow);
        
        // Show the modal
        await interaction.showModal(modal);
      }
    } catch (error) {
      logError('Error in targetfinder button handler:', error);
      
      if (!interaction.replied) {
        await interaction.reply({
          content: '❌ There was an error processing your request.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  },
  
  /**
   * Handle modal submissions for targetfinder
   * @param {ModalSubmitInteraction} interaction - Discord modal interaction
   * @param {Client} client - Discord client
   */
  async handleModal(interaction, client) {
    try {
      if (interaction.customId === 'targetfinder_stats_modal') {
        // Extract stats from the modal
        const strength = parseInt(interaction.fields.getTextInputValue('stat_strength').replace(/,/g, ''), 10);
        const defense = parseInt(interaction.fields.getTextInputValue('stat_defense').replace(/,/g, ''), 10);
        const speed = parseInt(interaction.fields.getTextInputValue('stat_speed').replace(/,/g, ''), 10);
        const dexterity = parseInt(interaction.fields.getTextInputValue('stat_dexterity').replace(/,/g, ''), 10);
        
        // Validate inputs
        if (isNaN(strength) || isNaN(defense) || isNaN(speed) || isNaN(dexterity)) {
          return interaction.reply({
            content: '❌ Invalid stats. Please enter numeric values only.',
            ephemeral: true
          });
        }
        
        // Create a stats object
        const userStats = {
          strength,
          defense,
          speed,
          dexterity
        };
        
        // Get API key for target finding
        const apiKey = getUserApiKey(interaction.user.id, 'torn');
        
        if (!apiKey) {
          return interaction.reply({
            content: '❌ You need to set up your Torn API key first! Use `/apikey` to set up your key.',
            ephemeral: true
          });
        }
        
        // Defer reply while we find targets
        await interaction.deferReply({ ephemeral: true });
        
        // Even with manual stats, we might be able to use the battle stats tracker for targets
        const useEnhancedTargets = (battleStatsTracker !== null);
        
        // Find targets based on manual stats
        await findTargets(interaction, client, userStats, apiKey, 10, 0.5, 0.6, useEnhancedTargets);
      }
    } catch (error) {
      logError('Error in targetfinder modal handler:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ There was an error processing your battle stats.',
          ephemeral: true
        }).catch(() => {});
      } else if (interaction.deferred) {
        await interaction.followUp({
          content: '❌ There was an error processing your battle stats.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
};

/**
 * Safely execute command with proper error isolation
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function safeExecuteCommand(interaction, client) {
  // Get options
  const maxResults = interaction.options.getInteger('max_results') || 10;
  const minFairFight = interaction.options.getNumber('min_fairfight') || 0.5;
  const minWinChance = interaction.options.getNumber('min_win_chance') || 0.6;
  
  // Get user API key
  const userId = interaction.user.id;
  const apiKey = getUserApiKey(userId, 'torn');
  
  if (!apiKey) {
    // If user doesn't have an API key, offer manual stats input
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('targetfinder_manual_stats')
        .setLabel('Enter Battle Stats Manually')
        .setStyle(ButtonStyle.Primary)
    );
    
    return interaction.reply({
      content: '❓ You don\'t have a Torn API key set up, which is needed to automatically get your battle stats. Would you like to enter your stats manually?',
      components: [row],
      ephemeral: true
    });
  }
  
  // Defer reply while we fetch user stats and find targets
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Try to get user's battle stats using the enhanced tracker if available
    let userStats = null;
    let useEnhancedStats = false;
    
    if (battleStatsTracker) {
      try {
        log(`Attempting to use battlestats-tracker for user ${interaction.user.tag}`);
        // Use myOwnId as null since we're getting the user's own stats from their API key
        const enhancedStats = await battleStatsTracker.getPlayerStats(null, apiKey);
        
        if (enhancedStats && enhancedStats.battleStats && enhancedStats.battleStats.total > 0) {
          useEnhancedStats = true;
          userStats = {
            strength: enhancedStats.battleStats.strength,
            defense: enhancedStats.battleStats.defense,
            speed: enhancedStats.battleStats.speed,
            dexterity: enhancedStats.battleStats.dexterity
          };
          log(`Successfully retrieved enhanced battle stats for targetfinder command`);
        }
      } catch (trackerError) {
        logError('Error getting enhanced stats for targetfinder:', trackerError);
        // Continue with the direct API approach
      }
    }
    
    // If we couldn't get stats from the tracker, fall back to direct API call
    if (!useEnhancedStats) {
      log('Falling back to direct API call for battle stats');
      const userResponse = await fetch(`https://api.torn.com/user/?selections=battlestats&key=${apiKey}`);
      const userData = await userResponse.json();
      
      if (userData.error) {
        await interaction.followUp({
          content: `❌ Error fetching your battle stats: ${userData.error.error}\n\nYour API key may not have the necessary permissions. Make sure your key has access to 'battlestats'!`,
          ephemeral: true
        });
        return;
      }
      
      // Create stats object for target finding
      userStats = {
        strength: userData.strength || 0,
        defense: userData.defense || 0,
        speed: userData.speed || 0,
        dexterity: userData.dexterity || 0
      };
    }
    
    // Find targets
    await findTargets(interaction, client, userStats, apiKey, maxResults, minFairFight, minWinChance, useEnhancedStats);
    
  } catch (error) {
    logError('Error finding targets:', error);
    await interaction.followUp({
      content: '❌ Failed to find targets. There may be an issue with the Torn API or your API key permissions.',
      ephemeral: true
    });
  }
}

/**
 * Find and display potential targets
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} userStats - User's battle stats
 * @param {string} apiKey - User's Torn API key
 * @param {number} maxResults - Maximum number of targets to find
 * @param {number} minFairFight - Minimum fair fight bonus
 * @param {number} minWinChance - Minimum win probability
 * @param {boolean} usingEnhancedStats - Whether enhanced stats were used
 */
async function findTargets(interaction, client, userStats, apiKey, maxResults = 10, minFairFight = 0.5, minWinChance = 0.6, usingEnhancedStats = false) {
  try {
    const totalStats = userStats.strength + userStats.defense + userStats.speed + userStats.dexterity;
    
    // Indicate if we're using enhanced stats
    const statsMessage = '🔍 Searching for targets based on your battle stats' + 
      (usingEnhancedStats ? ' (using enhanced stats):' : ':') + 
      `\n💪 Strength: ${userStats.strength.toLocaleString()}` +
      `\n🛡️ Defense: ${userStats.defense.toLocaleString()}` +
      `\n🏃‍♂️ Speed: ${userStats.speed.toLocaleString()}` +
      `\n🎯 Dexterity: ${userStats.dexterity.toLocaleString()}` +
      `\n🔥 Total: ${totalStats.toLocaleString()}`;
      
    await interaction.followUp({
      content: statsMessage,
      ephemeral: true
    });
    
    // Find potential targets
    let targets = await findPotentialTargets(userStats, apiKey, maxResults);
    
    if (!targets || targets.length === 0) {
      await interaction.followUp({
        content: '❌ No suitable targets found. Try adjusting your search criteria or try again later.',
        ephemeral: true
      });
      return;
    }
    
    // If we have the battle stats tracker and we're using enhanced stats,
    // try to enhance target calculations with more accurate data
    if (battleStatsTracker && usingEnhancedStats) {
      try {
        const enhancedTargets = [];
        
        // Process each target to see if we can get enhanced stats for them
        for (const target of targets) {
          try {
            // Try to get enhanced stats for this target
            const targetEnhancedStats = await battleStatsTracker.getPlayerStats(target.id, apiKey);
            
            if (targetEnhancedStats && targetEnhancedStats.battleStats && targetEnhancedStats.battleStats.total > 0) {
              log(`Using enhanced stats for target ${target.id}`);
              
              // Calculate more accurate fair fight and win probability
              const enhancedFairFight = targetEnhancedStats.fairFight?.multiplier || 
                                      calculateFairFightBonus(totalStats, targetEnhancedStats.battleStats.total);
              
              const enhancedWinProb = calculateWinProbability(
                userStats.strength, userStats.defense, userStats.speed, userStats.dexterity,
                targetEnhancedStats.battleStats.strength,
                targetEnhancedStats.battleStats.defense,
                targetEnhancedStats.battleStats.speed,
                targetEnhancedStats.battleStats.dexterity
              );
              
              // Update the target with enhanced data
              enhancedTargets.push({
                ...target,
                fairFightBonus: enhancedFairFight,
                winProbability: enhancedWinProb,
                confidence: targetEnhancedStats.confidence || 'Standard',
                enhancedStats: true
              });
            } else {
              // No enhanced stats, keep original target
              enhancedTargets.push(target);
            }
          } catch (targetError) {
            // On error, just use the original target data
            enhancedTargets.push(target);
          }
        }
        
        // If we got any enhanced targets, use them instead
        if (enhancedTargets.length > 0) {
          targets = enhancedTargets;
        }
      } catch (enhancementError) {
        logError('Error enhancing target data:', enhancementError);
        // Continue with original targets
      }
    }
    
    // Filter targets by fair fight and win chance
    const filteredTargets = targets.filter(target => 
      target.fairFightBonus >= minFairFight && 
      target.winProbability >= minWinChance
    );
    
    if (filteredTargets.length === 0) {
      await interaction.followUp({
        content: `❌ No targets meet your minimum criteria (Fair Fight >= ${minFairFight.toFixed(2)}, Win Chance >= ${(minWinChance * 100).toFixed(0)}%).`,
        ephemeral: true
      });
      return;
    }
    
    // Sort targets by score (fair fight * win probability)
    filteredTargets.sort((a, b) => {
      const scoreA = a.fairFightBonus * a.winProbability;
      const scoreB = b.fairFightBonus * b.winProbability;
      return scoreB - scoreA; // Descending order
    });
    
    // Create the target list embed
    const embed = new EmbedBuilder()
      .setTitle('🎯 Potential Targets')
      .setColor(Colors.Green)
      .setDescription(`Found ${filteredTargets.length} potential targets based on your battle stats.` +
        (usingEnhancedStats ? ' Using enhanced stats for greater accuracy.' : '') +
        '\nTargets are sorted by their combined score (fair fight bonus × win probability):')
      .setFooter({ text: `${BOT_CONFIG.name} | ${usingEnhancedStats ? 'Enhanced stats used' : 'Standard stats used'}` })
      .setTimestamp();
    
    // Add the top targets to the embed
    let targetList = '';
    const displayTargets = filteredTargets.slice(0, maxResults);
    
    for (let i = 0; i < displayTargets.length; i++) {
      const target = displayTargets[i];
      const fairFight = target.fairFightBonus.toFixed(2);
      const winChance = (target.winProbability * 100).toFixed(0);
      const score = (target.fairFightBonus * target.winProbability).toFixed(2);
      
      // Indicate confidence level if available
      const confidenceIndicator = target.enhancedStats && target.confidence
        ? ` [${target.confidence}]`
        : '';
      
      targetList += `${i + 1}. **${target.name}** [${target.id}] - Level ${target.level || '?'}\n`;
      targetList += `   • Fair Fight: ${fairFight}x | Win Chance: ${winChance}%${confidenceIndicator} | Score: ${score}\n`;
      targetList += `   • Activity: ${target.activity || 'Unknown'}\n`;
      targetList += `   • [View Profile](https://www.torn.com/profiles.php?XID=${target.id})\n\n`;
    }
    
    embed.addFields({ name: 'Targets', value: targetList || 'No suitable targets found.' });
    
    // Add a field explaining the scoring system
    embed.addFields({ 
      name: 'How Targeting Works', 
      value: 'Targets are scored based on two factors:\n' +
             '• Fair Fight Bonus: Higher values mean more respect/experience\n' +
             '• Win Probability: Estimated chance of winning the fight\n' +
             'The combined score helps you find optimal targets.'
    });
    
    // Send the targets list
    await interaction.followUp({
      embeds: [embed],
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in findTargets:', error);
    await interaction.followUp({
      content: '❌ An error occurred while finding targets. Please try again later.',
      ephemeral: true
    });
  }
}

module.exports = { targetfinderCommand };
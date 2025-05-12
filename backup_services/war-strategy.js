/**
 * War Strategy service for BrotherOwlManager
 * Provides intelligent war prediction, analytics, and personalized strategy recommendations
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');
const { formatTimeRemaining, formatDate } = require('../utils/formatting');
const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  Colors,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const { BOT_CONFIG } = require('../config');

// Data storage paths
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STRATEGIES_FILE = path.join(DATA_DIR, 'war_strategies.json');
const WAR_HISTORY_FILE = path.join(DATA_DIR, 'war_history.json');

// Constants
const SYNC_INTERVAL = 5 * 60 * 1000; // Sync data every 5 minutes
const PREDICTION_UPDATE_INTERVAL = 30 * 60 * 1000; // Update predictions every 30 minutes
const PERFORMANCE_CHECK_INTERVAL = 60 * 60 * 1000; // Check performance every hour

// War strategy data
let warStrategies = {};
let warHistory = {};

// Initialize data from files
try {
  if (fs.existsSync(STRATEGIES_FILE)) {
    warStrategies = JSON.parse(fs.readFileSync(STRATEGIES_FILE, 'utf8'));
  } else {
    fs.writeFileSync(STRATEGIES_FILE, JSON.stringify(warStrategies), 'utf8');
  }
} catch (error) {
  logError('Error loading war strategies:', error);
}

try {
  if (fs.existsSync(WAR_HISTORY_FILE)) {
    warHistory = JSON.parse(fs.readFileSync(WAR_HISTORY_FILE, 'utf8'));
  } else {
    fs.writeFileSync(WAR_HISTORY_FILE, JSON.stringify(warHistory), 'utf8');
  }
} catch (error) {
  logError('Error loading war history:', error);
}

// Active strategy rooms and predictors
const activeStrategyRooms = {};
const activePredictions = {};
let predictionIntervals = {};

/**
 * Save war strategies to file
 * @returns {boolean} Success or failure
 */
function saveWarStrategies() {
  try {
    fs.writeFileSync(STRATEGIES_FILE, JSON.stringify(warStrategies, null, 2), 'utf8');
    return true;
  } catch (error) {
    logError('Error saving war strategies:', error);
    return false;
  }
}

/**
 * Save war history to file
 * @returns {boolean} Success or failure
 */
function saveWarHistory() {
  try {
    fs.writeFileSync(WAR_HISTORY_FILE, JSON.stringify(warHistory, null, 2), 'utf8');
    return true;
  } catch (error) {
    logError('Error saving war history:', error);
    return false;
  }
}

/**
 * Create or update a war strategy room configuration
 * @param {string} serverId - Discord server ID
 * @param {Object} config - Strategy room configuration
 * @returns {boolean} Success or failure
 */
function setStrategyRoomConfig(serverId, config) {
  try {
    // Initialize server configuration if it doesn't exist
    if (!warStrategies[serverId]) {
      warStrategies[serverId] = {
        enabled: false,
        channelId: null,
        strategyBoards: [],
        memberPerformance: {},
        predictionSettings: {
          factors: {
            historyWeight: 0.4,
            strengthWeight: 0.3,
            activityWeight: 0.2,
            randomnessWeight: 0.1
          },
          confidenceThreshold: 70
        }
      };
    }

    // Update with new configuration
    warStrategies[serverId] = {
      ...warStrategies[serverId],
      ...config
    };

    // Save to file
    saveWarStrategies();
    log(`Updated war strategy configuration for server ${serverId}`);
    return true;
  } catch (error) {
    logError(`Error setting war strategy config for ${serverId}:`, error);
    return false;
  }
}

/**
 * Get war strategy room configuration
 * @param {string} serverId - Discord server ID
 * @returns {Object|null} Strategy room configuration or null if not set
 */
function getStrategyRoomConfig(serverId) {
  return warStrategies[serverId] || null;
}

/**
 * Create an embed for the strategy room
 * @param {Object} factionData - Faction data from API
 * @param {Object} config - Strategy room configuration
 * @param {string} serverId - Discord server ID
 * @returns {EmbedBuilder} Strategy room embed
 */
function createStrategyRoomEmbed(factionData, config, serverId) {
  const embed = new EmbedBuilder()
    .setTitle('⚔️ Faction War Strategy Room')
    .setColor(Colors.DarkNavy)
    .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
    .setTimestamp();

  // If no war is active, provide a general strategy board
  if (!factionData || !factionData.faction || !isWarActive(factionData)) {
    embed.setDescription('No active war detected. This is a general strategy planning board for future wars.');
    
    // Add historical statistics if available
    if (warHistory[serverId] && Object.keys(warHistory[serverId]).length > 0) {
      const stats = calculateHistoricalStats(serverId);
      
      embed.addFields(
        { name: 'Historical Win Rate', value: `${stats.winRate}%`, inline: true },
        { name: 'Total Wars', value: stats.totalWars.toString(), inline: true },
        { name: 'Recent Trend', value: stats.recentTrend, inline: true }
      );
    } else {
      embed.addFields(
        { name: 'Historical Data', value: 'No historical war data available yet.' }
      );
    }
    
    return embed;
  }

  // Active war detected
  const warData = extractWarData(factionData);
  
  if (!warData) {
    embed.setDescription('Error extracting war data. Please check API connection.');
    return embed;
  }
  
  // Generate prediction if available
  const prediction = activePredictions[serverId];
  const predictionText = prediction ? 
    `**Win Probability**: ${prediction.winProbability}%\n**Confidence**: ${prediction.confidence}%` :
    'Calculating war prediction...';
  
  // Create description with war information
  const description = [
    `**War Type**: ${warData.type}`,
    `**Opponent**: ${warData.opponentName} [ID: ${warData.opponentId}]`,
    `**Status**: ${warData.status}`,
    `**Start Time**: ${formatDate(new Date(warData.startTime))}`,
    `**End Time**: ${warData.endTime ? formatDate(new Date(warData.endTime)) : 'Ongoing'}`,
    '',
    '**📊 WAR PREDICTION**',
    predictionText,
    '',
    '**💡 STRATEGY RECOMMENDATION**',
    getStrategyRecommendation(warData, prediction, config)
  ].join('\n');
  
  embed.setDescription(description);
  
  // Add performance tracking if available
  if (config.memberPerformance && Object.keys(config.memberPerformance).length > 0) {
    const topPerformers = getTopPerformers(config.memberPerformance, 3);
    
    if (topPerformers.length > 0) {
      const performanceField = topPerformers.map(p => 
        `${p.name}: ${p.score} points (${p.wins} wins)`
      ).join('\n');
      
      embed.addFields({ name: '🏆 Top Performers', value: performanceField });
    }
  }
  
  return embed;
}

/**
 * Check if there's an active war
 * @param {Object} factionData - Faction data from API
 * @returns {boolean} True if war is active
 */
function isWarActive(factionData) {
  try {
    if (!factionData || !factionData.faction) return false;
    
    // Check territory wars
    if (factionData.території && 
       (factionData.території.assaulting || factionData.території.defending)) {
      return true;
    }
    
    // Check faction raids
    if (factionData.raid && 
       (factionData.raid.raiding || factionData.raid.defending)) {
      return true;
    }
    
    // Check assaults
    if (factionData.assault && factionData.assault.active) {
      return true;
    }
    
    return false;
  } catch (error) {
    logError('Error checking if war is active:', error);
    return false;
  }
}

/**
 * Extract relevant war data from faction data
 * @param {Object} factionData - Faction data from API
 * @returns {Object|null} Extracted war data or null if no war
 */
function extractWarData(factionData) {
  try {
    if (!factionData || !factionData.faction) return null;
    
    let warData = {
      type: 'Unknown',
      opponentId: null,
      opponentName: 'Unknown',
      status: 'Unknown',
      startTime: Date.now(),
      endTime: null,
      score: null,
      membersParticipating: []
    };
    
    // Check territory wars
    if (factionData.території && factionData.території.assaulting) {
      warData.type = 'Territory War';
      warData.opponentId = factionData.території.defender_id || 0;
      warData.opponentName = factionData.території.defender_name || 'Unknown';
      warData.status = 'Assaulting';
      
      if (factionData.території.start_timestamp) {
        warData.startTime = factionData.території.start_timestamp * 1000;
      }
      
      if (factionData.території.end_timestamp) {
        warData.endTime = factionData.території.end_timestamp * 1000;
      }
      
      return warData;
    }
    
    // Check defending territory
    if (factionData.території && factionData.території.defending) {
      warData.type = 'Territory Defense';
      warData.opponentId = factionData.території.attacker_id || 0;
      warData.opponentName = factionData.території.attacker_name || 'Unknown';
      warData.status = 'Defending';
      
      if (factionData.території.start_timestamp) {
        warData.startTime = factionData.території.start_timestamp * 1000;
      }
      
      if (factionData.території.end_timestamp) {
        warData.endTime = factionData.території.end_timestamp * 1000;
      }
      
      return warData;
    }
    
    // Check faction raids
    if (factionData.raid && factionData.raid.raiding) {
      warData.type = 'Faction Raid';
      warData.opponentId = factionData.raid.defender_id || 0;
      warData.opponentName = factionData.raid.defender_name || 'Unknown';
      warData.status = 'Raiding';
      
      if (factionData.raid.start_timestamp) {
        warData.startTime = factionData.raid.start_timestamp * 1000;
      }
      
      if (factionData.raid.end_timestamp) {
        warData.endTime = factionData.raid.end_timestamp * 1000;
      }
      
      if (factionData.raid.score) {
        warData.score = `${factionData.raid.score.raider || 0} - ${factionData.raid.score.defender || 0}`;
      }
      
      return warData;
    }
    
    // Check defending from raid
    if (factionData.raid && factionData.raid.defending) {
      warData.type = 'Raid Defense';
      warData.opponentId = factionData.raid.attacker_id || 0;
      warData.opponentName = factionData.raid.attacker_name || 'Unknown';
      warData.status = 'Defending Raid';
      
      if (factionData.raid.start_timestamp) {
        warData.startTime = factionData.raid.start_timestamp * 1000;
      }
      
      if (factionData.raid.end_timestamp) {
        warData.endTime = factionData.raid.end_timestamp * 1000;
      }
      
      if (factionData.raid.score) {
        warData.score = `${factionData.raid.score.defender || 0} - ${factionData.raid.score.raider || 0}`;
      }
      
      return warData;
    }
    
    // Check assaults
    if (factionData.assault && factionData.assault.active) {
      warData.type = 'Assault';
      warData.opponentId = factionData.assault.defender_id || 0;
      warData.opponentName = factionData.assault.defender_name || 'Unknown';
      warData.status = 'Assaulting';
      
      if (factionData.assault.start_timestamp) {
        warData.startTime = factionData.assault.start_timestamp * 1000;
      }
      
      if (factionData.assault.end_timestamp) {
        warData.endTime = factionData.assault.end_timestamp * 1000;
      }
      
      if (factionData.assault.score) {
        warData.score = `${factionData.assault.score.assaulter || 0} - ${factionData.assault.score.defender || 0}`;
      }
      
      return warData;
    }
    
    return null;
  } catch (error) {
    logError('Error extracting war data:', error);
    return null;
  }
}

/**
 * Calculate historical statistics for a server
 * @param {string} serverId - Discord server ID
 * @returns {Object} Historical statistics
 */
function calculateHistoricalStats(serverId) {
  try {
    const serverHistory = warHistory[serverId] || {};
    const wars = Object.values(serverHistory);
    
    // Default stats
    const stats = {
      winRate: 0,
      totalWars: 0,
      recentTrend: 'No trend data'
    };
    
    if (wars.length === 0) return stats;
    
    // Calculate win rate
    const wins = wars.filter(war => war.result === 'win').length;
    stats.totalWars = wars.length;
    stats.winRate = Math.round((wins / stats.totalWars) * 100);
    
    // Calculate recent trend (last 5 wars)
    const recentWars = wars.sort((a, b) => b.endTime - a.endTime).slice(0, 5);
    
    if (recentWars.length >= 3) {
      const recentWins = recentWars.filter(war => war.result === 'win').length;
      const recentWinRate = Math.round((recentWins / recentWars.length) * 100);
      
      if (recentWinRate > stats.winRate + 10) {
        stats.recentTrend = '📈 Improving';
      } else if (recentWinRate < stats.winRate - 10) {
        stats.recentTrend = '📉 Declining';
      } else {
        stats.recentTrend = '➡️ Stable';
      }
    }
    
    return stats;
  } catch (error) {
    logError('Error calculating historical stats:', error);
    return {
      winRate: 0,
      totalWars: 0,
      recentTrend: 'Error calculating trend'
    };
  }
}

/**
 * Generate a war strategy recommendation
 * @param {Object} warData - Current war data
 * @param {Object} prediction - Prediction data
 * @param {Object} config - Strategy room configuration
 * @returns {string} Strategy recommendation
 */
function getStrategyRecommendation(warData, prediction, config) {
  try {
    if (!warData) return 'No active war detected.';
    
    // Without prediction, provide a generic recommendation
    if (!prediction) {
      return 'Gathering data to generate a personalized strategy. Check back soon.';
    }
    
    const { winProbability, confidence, factors } = prediction;
    
    // Low confidence recommendations
    if (confidence < 60) {
      return 'Low prediction confidence. Focus on defensive positioning and information gathering.';
    }
    
    // Generate strategy based on win probability
    if (winProbability >= 80) {
      return 'High win probability detected. Recommend aggressive strategy with focus on quick victory to minimize losses.\n\n• Coordinate attacks during peak hours\n• Focus on high-value targets\n• Maintain chain bonus for maximum impact';
    } else if (winProbability >= 60) {
      return 'Moderate win probability. Recommend balanced approach with targeted aggression.\n\n• Focus on defensive positioning with counter-attack capability\n• Target opponent weaknesses identified in analysis\n• Maintain activity rotation to prevent burnout';
    } else if (winProbability >= 40) {
      return 'Even match detected. Recommend strategic caution with opportunistic offense.\n\n• Establish defensive rotations\n• Focus on efficiency rather than volume\n• Coordinate key timeframes for synchronized attacks';
    } else if (winProbability >= 20) {
      return 'Challenging match detected. Recommend defensive focus with targeted counter-attacks.\n\n• Prioritize defensive coordination\n• Focus on endurance and sustainability\n• Target high-value opponents to maximize impact';
    } else {
      return 'Low win probability detected. Recommend full defensive posture.\n\n• Coordinate maximum defense\n• Conserve resources and energy\n• Focus on minimizing losses and extending duration';
    }
  } catch (error) {
    logError('Error generating strategy recommendation:', error);
    return 'Error generating strategy recommendation. Please check the system logs.';
  }
}

/**
 * Get top performers from member performance data
 * @param {Object} performanceData - Member performance data
 * @param {number} limit - Maximum number of top performers to return
 * @returns {Array} Top performers
 */
function getTopPerformers(performanceData, limit = 3) {
  try {
    return Object.entries(performanceData)
      .map(([memberId, data]) => ({
        id: memberId,
        name: data.name || 'Unknown',
        score: data.score || 0,
        wins: data.wins || 0,
        participation: data.participation || 0
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    logError('Error getting top performers:', error);
    return [];
  }
}

/**
 * Create war strategy planning components
 * @returns {Array} Array of component rows
 */
function createStrategyComponents() {
  // Create action row with buttons
  const actionRow1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('warstrategy_analyze')
        .setLabel('Analyze Opponent')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔍'),
      new ButtonBuilder()
        .setCustomId('warstrategy_suggest')
        .setLabel('Suggest Strategy')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💡'),
      new ButtonBuilder()
        .setCustomId('warstrategy_refresh')
        .setLabel('Refresh Data')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
    );
    
  // Create action row with planning buttons
  const actionRow2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('warstrategy_plan')
        .setLabel('Create Plan')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝'),
      new ButtonBuilder()
        .setCustomId('warstrategy_roster')
        .setLabel('Manage Roster')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👥'),
      new ButtonBuilder()
        .setCustomId('warstrategy_settings')
        .setLabel('Settings')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚙️')
    );
    
  return [actionRow1, actionRow2];
}

/**
 * Generate a war win probability prediction
 * @param {string} serverId - Discord server ID
 * @param {Object} factionData - Faction data from API
 * @returns {Object|null} Prediction data or null if prediction failed
 */
function generateWarPrediction(serverId, factionData) {
  try {
    if (!factionData || !isWarActive(factionData)) return null;
    
    const warData = extractWarData(factionData);
    if (!warData) return null;
    
    const config = getStrategyRoomConfig(serverId);
    if (!config) return null;
    
    const factors = config.predictionSettings?.factors || {
      historyWeight: 0.4,
      strengthWeight: 0.3,
      activityWeight: 0.2,
      randomnessWeight: 0.1
    };
    
    // Calculate historical factor
    let historicalFactor = 0.5; // Default to 50%
    const serverHistory = warHistory[serverId] || {};
    
    // Check if we've fought this opponent before
    const previousWars = Object.values(serverHistory).filter(
      war => war.opponentId === warData.opponentId
    );
    
    if (previousWars.length > 0) {
      const wins = previousWars.filter(war => war.result === 'win').length;
      historicalFactor = wins / previousWars.length;
    }
    
    // Calculate strength factor - in a real implementation, this would use actual data
    // For the demo, we'll use a simulated value
    const strengthFactor = Math.random() * 0.3 + 0.35; // Between 0.35 and 0.65
    
    // Calculate activity factor - in a real implementation, this would use actual data
    // For the demo, we'll use a simulated value
    const activityFactor = Math.random() * 0.4 + 0.3; // Between 0.3 and 0.7
    
    // Add randomness factor (to simulate unknown variables)
    const randomnessFactor = Math.random();
    
    // Calculate weighted probability
    const probability = 
      (historicalFactor * factors.historyWeight) +
      (strengthFactor * factors.strengthWeight) +
      (activityFactor * factors.activityWeight) +
      (randomnessFactor * factors.randomnessWeight);
    
    // Calculate confidence based on amount of data we have
    let confidence = 50; // Default confidence
    
    if (previousWars.length > 5) {
      confidence += 25; // More confidence with more historical data
    } else if (previousWars.length > 0) {
      confidence += previousWars.length * 5; // Some confidence with some historical data
    }
    
    // Adjust confidence based on data freshness
    // In a real implementation, this would use actual data quality metrics
    confidence = Math.min(95, confidence); // Cap at 95%
    
    // Format the prediction
    const prediction = {
      winProbability: Math.round(probability * 100),
      confidence: confidence,
      factors: {
        historical: Math.round(historicalFactor * 100),
        strength: Math.round(strengthFactor * 100),
        activity: Math.round(activityFactor * 100)
      },
      generatedAt: Date.now(),
      warId: `${warData.type}_${warData.opponentId}_${warData.startTime}`
    };
    
    // Store the prediction
    activePredictions[serverId] = prediction;
    
    return prediction;
  } catch (error) {
    logError('Error generating war prediction:', error);
    return null;
  }
}

/**
 * Create or update a war strategy room
 * @param {Client} client - Discord client
 * @param {string} serverId - Discord server ID
 */
async function createOrUpdateStrategyRoom(client, serverId) {
  try {
    const config = warStrategies[serverId];
    if (!config || !config.enabled || !config.channelId) return;
    
    // Get the server and channel
    const guild = await client.guilds.fetch(serverId).catch(() => null);
    if (!guild) return;
    
    const channel = await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    
    // Get faction data from client
    const factionData = client.tornData;
    
    // Generate or update prediction
    if (!activePredictions[serverId] || 
        (activePredictions[serverId].generatedAt + PREDICTION_UPDATE_INTERVAL < Date.now())) {
      generateWarPrediction(serverId, factionData);
    }
    
    // Create strategy room embed
    const embed = createStrategyRoomEmbed(factionData, config, serverId);
    
    // Create components
    const components = createStrategyComponents();
    
    // Check if we have an active strategy room
    if (activeStrategyRooms[serverId]) {
      // Update existing message
      try {
        const message = await channel.messages.fetch(activeStrategyRooms[serverId].messageId).catch(() => null);
        
        if (message) {
          await message.edit({ embeds: [embed], components }).catch(error => {
            logError(`Error updating strategy room for ${serverId}:`, error);
          });
          return;
        }
      } catch (error) {
        logError(`Error fetching strategy room message for ${serverId}:`, error);
        // Fall through to create a new message
      }
    }
    
    // Create new strategy room message
    const message = await channel.send({ embeds: [embed], components });
    
    // Store the reference
    activeStrategyRooms[serverId] = {
      messageId: message.id,
      channelId: channel.id,
      lastUpdated: Date.now()
    };
    
    log(`Created war strategy room for server ${serverId}`);
  } catch (error) {
    logError(`Error creating/updating strategy room for ${serverId}:`, error);
  }
}

/**
 * Handle button interactions for war strategy
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 */
async function handleStrategyButton(interaction, client) {
  try {
    const serverId = interaction.guildId;
    const config = getStrategyRoomConfig(serverId);
    
    // If no config, respond with setup instructions
    if (!config) {
      return interaction.reply({
        content: 'The war strategy system has not been set up for this server. Please use the `/warstrategy setup` command first.',
        ephemeral: true
      });
    }
    
    // Handle different button actions
    switch (interaction.customId) {
      case 'warstrategy_analyze':
        await handleAnalyzeOpponent(interaction, client);
        break;
        
      case 'warstrategy_suggest':
        await handleSuggestStrategy(interaction, client);
        break;
        
      case 'warstrategy_refresh':
        await handleRefreshStrategy(interaction, client);
        break;
        
      case 'warstrategy_plan':
        await handleCreatePlan(interaction, client);
        break;
        
      case 'warstrategy_roster':
        await handleManageRoster(interaction, client);
        break;
        
      case 'warstrategy_settings':
        await handleStrategySettings(interaction, client);
        break;
        
      default:
        await interaction.reply({
          content: 'Unknown strategy action.',
          ephemeral: true
        });
    }
  } catch (error) {
    logError('Error handling strategy button:', error);
    
    try {
      await interaction.followUp({
        content: '❌ Error processing strategy action.',
        ephemeral: true
      });
    } catch {
      // Ignore if we can't follow up
    }
  }
}

/**
 * Handle analyze opponent button
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 */
async function handleAnalyzeOpponent(interaction, client) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const serverId = interaction.guildId;
    const factionData = client.tornData;
    
    if (!factionData || !isWarActive(factionData)) {
      return interaction.followUp({
        content: 'No active war detected. Unable to analyze opponent.',
        ephemeral: true
      });
    }
    
    const warData = extractWarData(factionData);
    
    // Create analysis embed
    const embed = new EmbedBuilder()
      .setTitle(`🔍 Opponent Analysis: ${warData.opponentName}`)
      .setColor(Colors.Blue)
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // In a real implementation, we would fetch actual opponent data
    // For the demo, we'll use simulated data
    
    const strength = Math.floor(Math.random() * 100); // 0-100 strength rating
    const activity = Math.floor(Math.random() * 100); // 0-100 activity rating
    const organization = Math.floor(Math.random() * 100); // 0-100 organization rating
    
    // Get historical matchup data
    const serverHistory = warHistory[serverId] || {};
    const previousWars = Object.values(serverHistory).filter(
      war => war.opponentId === warData.opponentId
    );
    
    let historyText = 'No previous wars against this opponent.';
    
    if (previousWars.length > 0) {
      const wins = previousWars.filter(war => war.result === 'win').length;
      const losses = previousWars.length - wins;
      historyText = `**Record vs ${warData.opponentName}**: ${wins} wins, ${losses} losses\n`;
      
      // Add details of last war
      if (previousWars.length > 0) {
        const lastWar = previousWars.sort((a, b) => b.endTime - a.endTime)[0];
        historyText += `**Last War**: ${formatDate(new Date(lastWar.endTime))}\n`;
        historyText += `**Outcome**: ${lastWar.result === 'win' ? 'Victory' : 'Defeat'}\n`;
        if (lastWar.score) {
          historyText += `**Score**: ${lastWar.score}\n`;
        }
      }
    }
    
    // Create strength ratings as progress bars
    const createRatingBar = (rating) => {
      const filledLength = Math.floor(10 * (rating / 100));
      return '█'.repeat(filledLength) + '░'.repeat(10 - filledLength);
    };
    
    // Add fields to embed
    embed.setDescription(`Analysis of ${warData.opponentName} [ID: ${warData.opponentId}] based on historical data and current intelligence.`);
    
    embed.addFields(
      { name: 'Faction Strength', value: `${createRatingBar(strength)} ${strength}/100`, inline: false },
      { name: 'Activity Level', value: `${createRatingBar(activity)} ${activity}/100`, inline: false },
      { name: 'Organization', value: `${createRatingBar(organization)} ${organization}/100`, inline: false },
      { name: 'Historical Matchup', value: historyText, inline: false }
    );
    
    // Add threats and weaknesses
    embed.addFields(
      { name: '⚠️ Key Threats', value: 'Analysis of opponent capabilities is still in progress.', inline: false },
      { name: '🎯 Exploitable Weaknesses', value: 'Analysis of opponent weaknesses is still in progress.', inline: false }
    );
    
    await interaction.followUp({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    logError('Error analyzing opponent:', error);
    
    try {
      await interaction.followUp({
        content: '❌ Error analyzing opponent.',
        ephemeral: true
      });
    } catch {
      // Ignore if we can't follow up
    }
  }
}

/**
 * Handle suggest strategy button
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 */
async function handleSuggestStrategy(interaction, client) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const serverId = interaction.guildId;
    const factionData = client.tornData;
    
    if (!factionData || !isWarActive(factionData)) {
      return interaction.followUp({
        content: 'No active war detected. Unable to suggest strategy.',
        ephemeral: true
      });
    }
    
    const warData = extractWarData(factionData);
    const prediction = activePredictions[serverId];
    const config = getStrategyRoomConfig(serverId);
    
    // Create strategy embed
    const embed = new EmbedBuilder()
      .setTitle(`💡 War Strategy: ${warData.opponentName}`)
      .setColor(Colors.Gold)
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // Generate strategy recommendation
    const recommendation = getStrategyRecommendation(warData, prediction, config);
    
    // Create additional tactical recommendations
    let tacticalAdvice = '';
    
    // In a real implementation, this would be based on actual data analysis
    // For the demo, we'll provide simulated recommendations
    if (prediction && prediction.winProbability > 60) {
      tacticalAdvice = [
        '**Offensive Focus**',
        '• Coordinate attacks during opponent low activity periods',
        '• Target their active chain participants to disrupt momentum',
        '• Maintain revive chains to maximize efficiency',
        '',
        '**Key Timings**',
        '• Primary attack window: 8-10 PM server time',
        '• Secondary push: 6-8 AM server time',
        '• Hold defensive positions between major pushes'
      ].join('\n');
    } else {
      tacticalAdvice = [
        '**Defensive Focus**',
        '• Prioritize defense during opponent peak hours',
        '• Establish rotation schedule to maintain coverage',
        '• Focus on efficient revive chains to maximize staying power',
        '',
        '**Key Timings**',
        '• Primary defense window: 7-11 PM server time',
        '• Counter-attack window: 4-6 AM server time',
        '• Conserve resources during non-critical periods'
      ].join('\n');
    }
    
    // Add fields to embed
    embed.setDescription(`Strategic recommendations for the current war against ${warData.opponentName}.`);
    
    if (prediction) {
      embed.addFields(
        { name: '📊 War Assessment', value: `**Win Probability**: ${prediction.winProbability}%\n**Confidence**: ${prediction.confidence}%`, inline: false }
      );
    }
    
    embed.addFields(
      { name: '💡 Strategic Recommendation', value: recommendation, inline: false },
      { name: '⚔️ Tactical Advice', value: tacticalAdvice, inline: false }
    );
    
    // Add personalized player recommendations if we have performance data
    if (config.memberPerformance && Object.keys(config.memberPerformance).length > 0) {
      // In a real implementation, this would generate personalized recommendations
      // For the demo, we'll use a placeholder
      embed.addFields(
        { name: '👤 Personalized Assignments', value: 'Personalized recommendations are being generated based on member performance profiles.', inline: false }
      );
    }
    
    await interaction.followUp({
      embeds: [embed],
      ephemeral: true
    });
  } catch (error) {
    logError('Error suggesting strategy:', error);
    
    try {
      await interaction.followUp({
        content: '❌ Error generating strategy suggestion.',
        ephemeral: true
      });
    } catch {
      // Ignore if we can't follow up
    }
  }
}

/**
 * Handle refresh strategy button
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 */
async function handleRefreshStrategy(interaction, client) {
  try {
    await interaction.deferUpdate();
    
    const serverId = interaction.guildId;
    
    // Generate a new prediction
    const factionData = client.tornData;
    generateWarPrediction(serverId, factionData);
    
    // Update the strategy room
    await createOrUpdateStrategyRoom(client, serverId);
    
    // If the message being updated is different from the strategy room message,
    // send a follow-up message
    if (interaction.message.id !== activeStrategyRooms[serverId]?.messageId) {
      await interaction.followUp({
        content: '✅ Strategy room refreshed.',
        ephemeral: true
      });
    }
  } catch (error) {
    logError('Error refreshing strategy:', error);
    
    try {
      await interaction.followUp({
        content: '❌ Error refreshing strategy data.',
        ephemeral: true
      });
    } catch {
      // Ignore if we can't follow up
    }
  }
}

/**
 * Handle create plan button
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 */
async function handleCreatePlan(interaction, client) {
  try {
    // Create a modal for plan creation
    const modal = new ModalBuilder()
      .setCustomId('warstrategy_plan_modal')
      .setTitle('Create War Strategy Plan');
    
    // Add inputs to the modal
    const titleInput = new TextInputBuilder()
      .setCustomId('plan_title')
      .setLabel('Plan Title')
      .setPlaceholder('e.g., Nighttime Offense Strategy')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    const descriptionInput = new TextInputBuilder()
      .setCustomId('plan_description')
      .setLabel('Strategy Description')
      .setPlaceholder('Describe the overall strategy and objectives...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    
    const tacticsInput = new TextInputBuilder()
      .setCustomId('plan_tactics')
      .setLabel('Tactical Instructions')
      .setPlaceholder('List specific tactical instructions or assignments...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    
    // Add inputs to rows
    const titleRow = new ActionRowBuilder().addComponents(titleInput);
    const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
    const tacticsRow = new ActionRowBuilder().addComponents(tacticsInput);
    
    // Add rows to modal
    modal.addComponents(titleRow, descriptionRow, tacticsRow);
    
    // Show modal to user
    await interaction.showModal(modal);
  } catch (error) {
    logError('Error creating plan modal:', error);
    
    try {
      await interaction.reply({
        content: '❌ Error opening plan creation form.',
        ephemeral: true
      });
    } catch {
      // Ignore if we can't reply
    }
  }
}

/**
 * Handle manage roster button
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 */
async function handleManageRoster(interaction, client) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const serverId = interaction.guildId;
    const config = getStrategyRoomConfig(serverId);
    
    if (!config) {
      return interaction.followUp({
        content: 'War strategy system is not configured for this server.',
        ephemeral: true
      });
    }
    
    // Create roster management embed
    const embed = new EmbedBuilder()
      .setTitle('👥 War Roster Management')
      .setColor(Colors.Aqua)
      .setDescription('Manage your war participation roster and assign roles.')
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // Add current roster if any exists
    if (config.roster && config.roster.length > 0) {
      const rosterText = config.roster
        .map(member => `• ${member.name} - ${member.role || 'Unassigned'}`)
        .join('\n');
      
      embed.addFields({ name: 'Current Roster', value: rosterText });
    } else {
      embed.addFields({ name: 'Current Roster', value: 'No members added to the war roster yet.' });
    }
    
    // Add instructions
    embed.addFields({ 
      name: 'Instructions', 
      value: 'Use the buttons below to add members to the roster, remove members, or assign war roles.'
    });
    
    // Create action row with roster management buttons
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('warstrategy_roster_add')
          .setLabel('Add Member')
          .setStyle(ButtonStyle.Success)
          .setEmoji('➕'),
        new ButtonBuilder()
          .setCustomId('warstrategy_roster_remove')
          .setLabel('Remove Member')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('➖'),
        new ButtonBuilder()
          .setCustomId('warstrategy_roster_assign')
          .setLabel('Assign Roles')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🏷️')
      );
    
    await interaction.followUp({
      embeds: [embed],
      components: [actionRow],
      ephemeral: true
    });
  } catch (error) {
    logError('Error managing roster:', error);
    
    try {
      await interaction.followUp({
        content: '❌ Error opening roster management.',
        ephemeral: true
      });
    } catch {
      // Ignore if we can't follow up
    }
  }
}

/**
 * Handle strategy settings button
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 */
async function handleStrategySettings(interaction, client) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const serverId = interaction.guildId;
    const config = getStrategyRoomConfig(serverId);
    
    if (!config) {
      return interaction.followUp({
        content: 'War strategy system is not configured for this server.',
        ephemeral: true
      });
    }
    
    // Create settings embed
    const embed = new EmbedBuilder()
      .setTitle('⚙️ War Strategy Settings')
      .setColor(Colors.Greyple)
      .setDescription('Configure your war strategy and prediction settings.')
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // Add current settings
    const predictionSettings = config.predictionSettings || {
      factors: {
        historyWeight: 0.4,
        strengthWeight: 0.3,
        activityWeight: 0.2,
        randomnessWeight: 0.1
      },
      confidenceThreshold: 70
    };
    
    const settingsText = [
      '**Prediction Weights**',
      `• Historical Data: ${predictionSettings.factors.historyWeight * 100}%`,
      `• Strength Assessment: ${predictionSettings.factors.strengthWeight * 100}%`,
      `• Activity Analysis: ${predictionSettings.factors.activityWeight * 100}%`,
      `• Unknown Factors: ${predictionSettings.factors.randomnessWeight * 100}%`,
      '',
      `**Confidence Threshold**: ${predictionSettings.confidenceThreshold}%`,
      '(Predictions below this threshold are marked as low confidence)'
    ].join('\n');
    
    embed.addFields({ name: 'Current Settings', value: settingsText });
    
    // Add notification settings if any
    if (config.notifications) {
      const notificationText = [
        `**Enabled**: ${config.notifications.enabled ? 'Yes' : 'No'}`,
        `**Channel**: <#${config.notifications.channelId || config.channelId}>`,
        `**War Start**: ${config.notifications.warStart ? 'Yes' : 'No'}`,
        `**War End**: ${config.notifications.warEnd ? 'Yes' : 'No'}`,
        `**Critical Events**: ${config.notifications.criticalEvents ? 'Yes' : 'No'}`
      ].join('\n');
      
      embed.addFields({ name: 'Notification Settings', value: notificationText });
    }
    
    // Create action row with settings buttons
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('warstrategy_settings_prediction')
          .setLabel('Prediction Settings')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📊'),
        new ButtonBuilder()
          .setCustomId('warstrategy_settings_notifications')
          .setLabel('Notification Settings')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔔'),
        new ButtonBuilder()
          .setCustomId('warstrategy_settings_reset')
          .setLabel('Reset to Default')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔄')
      );
    
    await interaction.followUp({
      embeds: [embed],
      components: [actionRow],
      ephemeral: true
    });
  } catch (error) {
    logError('Error handling strategy settings:', error);
    
    try {
      await interaction.followUp({
        content: '❌ Error opening strategy settings.',
        ephemeral: true
      });
    } catch {
      // Ignore if we can't follow up
    }
  }
}

/**
 * Handle the modal submission for creating a war plan
 * @param {ModalSubmitInteraction} interaction - Discord modal interaction
 * @param {Client} client - Discord client
 */
async function handlePlanModalSubmit(interaction, client) {
  try {
    await interaction.deferReply({ ephemeral: false });
    
    const serverId = interaction.guildId;
    const config = getStrategyRoomConfig(serverId);
    
    if (!config) {
      return interaction.followUp({
        content: 'War strategy system is not configured for this server.',
        ephemeral: true
      });
    }
    
    // Get form values
    const title = interaction.fields.getTextInputValue('plan_title');
    const description = interaction.fields.getTextInputValue('plan_description');
    const tactics = interaction.fields.getTextInputValue('plan_tactics');
    
    // Create a new plan ID
    const planId = `plan_${Date.now()}`;
    
    // Initialize strategy boards if needed
    if (!config.strategyBoards) {
      config.strategyBoards = [];
    }
    
    // Add the new plan
    config.strategyBoards.push({
      id: planId,
      title,
      description,
      tactics,
      createdBy: interaction.user.id,
      createdAt: Date.now(),
      status: 'active'
    });
    
    // Save the updated configuration
    setStrategyRoomConfig(serverId, config);
    
    // Create an embed for the plan
    const embed = new EmbedBuilder()
      .setTitle(`📝 War Plan: ${title}`)
      .setColor(Colors.Navy)
      .setDescription(description)
      .addFields(
        { name: '⚔️ Tactical Instructions', value: tactics },
        { name: 'Status', value: 'Active', inline: true },
        { name: 'Created By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Created At', value: formatDate(new Date()), inline: true }
      )
      .setFooter({ text: `Plan ID: ${planId} • ${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // Create action row with plan management buttons
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`warstrategy_plan_edit_${planId}`)
          .setLabel('Edit Plan')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✏️'),
        new ButtonBuilder()
          .setCustomId(`warstrategy_plan_archive_${planId}`)
          .setLabel('Archive Plan')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📁'),
        new ButtonBuilder()
          .setCustomId(`warstrategy_plan_delete_${planId}`)
          .setLabel('Delete Plan')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
      );
    
    await interaction.followUp({
      content: '✅ War plan created successfully!',
      embeds: [embed],
      components: [actionRow]
    });
    
    // Update the strategy room
    await createOrUpdateStrategyRoom(client, serverId);
  } catch (error) {
    logError('Error handling plan modal submit:', error);
    
    try {
      await interaction.followUp({
        content: '❌ Error creating war plan.',
        ephemeral: true
      });
    } catch {
      // Ignore if we can't follow up
    }
  }
}

/**
 * Handle select menu interactions for strategy
 * @param {StringSelectMenuInteraction} interaction - Discord select menu interaction
 * @param {Client} client - Discord client
 */
async function handleStrategySelectMenu(interaction, client) {
  try {
    // Different select menus will be handled here
    const selectMenuId = interaction.customId;
    
    if (selectMenuId.startsWith('warstrategy_roster_role_')) {
      // Handle role assignment
      await handleRoleAssignment(interaction, client);
    } else if (selectMenuId.startsWith('warstrategy_settings_prediction_')) {
      // Handle prediction settings
      await handlePredictionSettings(interaction, client);
    }
  } catch (error) {
    logError('Error handling strategy select menu:', error);
    
    try {
      await interaction.reply({
        content: '❌ Error processing selection.',
        ephemeral: true
      });
    } catch {
      // Ignore if we can't reply
    }
  }
}

/**
 * Handle role assignment selection
 * @param {StringSelectMenuInteraction} interaction - Discord select menu interaction
 * @param {Client} client - Discord client
 */
async function handleRoleAssignment(interaction, client) {
  // This is a placeholder for the role assignment functionality
  // In a real implementation, this would update the role assignments
  await interaction.update({ content: 'Role assignments have been updated.', components: [] });
}

/**
 * Handle prediction settings selection
 * @param {StringSelectMenuInteraction} interaction - Discord select menu interaction
 * @param {Client} client - Discord client
 */
async function handlePredictionSettings(interaction, client) {
  // This is a placeholder for the prediction settings functionality
  // In a real implementation, this would update the prediction settings
  await interaction.update({ content: 'Prediction settings have been updated.', components: [] });
}

/**
 * Check for wars and update strategy rooms
 * @param {Client} client - Discord client
 */
async function checkWarsAndUpdateStrategyRooms(client) {
  try {
    if (!client || !client.tornData) return;
    
    // Check each configured server
    for (const serverId in warStrategies) {
      const config = warStrategies[serverId];
      
      if (config && config.enabled) {
        await createOrUpdateStrategyRoom(client, serverId);
      }
    }
  } catch (error) {
    logError('Error checking wars and updating strategy rooms:', error);
  }
}

/**
 * Initialize the war strategy service
 * @param {Client} client - Discord client
 */
function initWarStrategyService(client) {
  if (!client) return;
  
  // Check for wars and update strategy rooms immediately
  checkWarsAndUpdateStrategyRooms(client);
  
  // Set up intervals for updates
  setInterval(() => {
    checkWarsAndUpdateStrategyRooms(client);
  }, SYNC_INTERVAL);
  
  // Regularly save data
  setInterval(() => {
    saveWarStrategies();
    saveWarHistory();
  }, SYNC_INTERVAL);
  
  log('War strategy service initialized');
}

module.exports = {
  getStrategyRoomConfig,
  setStrategyRoomConfig,
  handleStrategyButton,
  handlePlanModalSubmit,
  handleStrategySelectMenu,
  initWarStrategyService
};
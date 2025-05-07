/**
 * Spy command for BrotherOwlManager
 * Gathers intelligence on enemy faction members including battle stats, activity patterns, and more
 */

const { 
  SlashCommandBuilder, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  AttachmentBuilder
} = require('discord.js');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const { getPlayerBattleStats, getFactionMembersStats, extractWebContent } = require('../utils/torn-scraper');
const { getUserApiKey } = require('./apikey');

// Try to import battle stats tracker (won't crash if not available)
let battleStatsTracker;
try {
  battleStatsTracker = require('../services/battlestats-tracker');
  log('BattleStats tracker loaded for spy command integration');
} catch (error) {
  // Silently continue if module doesn't exist
  log('BattleStats tracker not available for spy command integration');
}

// Create a command builder for the spy command
const spyCommand = {
  data: new SlashCommandBuilder()
    .setName('spy')
    .setDescription('Gather intelligence on enemy factions and players')
    .addSubcommand(subcommand => 
      subcommand
        .setName('faction')
        .setDescription('Spy on a faction to see member stats and activity')
        .addStringOption(option => 
          option.setName('faction_id')
            .setDescription('The ID of the faction to spy on')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('include_details')
            .setDescription('Include detailed analysis of each player')
            .setRequired(false)))
    .addSubcommand(subcommand => 
      subcommand
        .setName('player')
        .setDescription('Spy on an individual player to see their stats and activity')
        .addStringOption(option => 
          option.setName('player_id_or_name')
            .setDescription('Enter either a player ID (numbers only) or player name to spy on')
            .setRequired(true))),

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
      logError('Error executing spy command (protected):', error);
      
      // Handle errors in responding to the interaction
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ There was an error gathering intelligence. This error has been logged and will not affect other bot functionality.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.followUp({
            content: '❌ There was an error gathering intelligence. This error has been logged and will not affect other bot functionality.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending spy command error reply:', replyError);
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
  const subcommand = interaction.options.getSubcommand();
  
  // Get user API key - required for all spy operations
  const userId = interaction.user.id;
  const apiKey = getUserApiKey(userId, 'torn');
  
  if (!apiKey) {
    return interaction.reply({
      content: '❌ You need to set up your Torn API key first! Use `/apikey` to set up your key.',
      ephemeral: true
    });
  }
  
  // Acknowledge the command immediately as data gathering might take time
  await interaction.deferReply({ ephemeral: true });
  
  switch (subcommand) {
    case 'faction':
      await handleFactionSpy(interaction, client, apiKey);
      break;
      
    case 'player':
      await handlePlayerSpy(interaction, client, apiKey);
      break;
      
    default:
      await interaction.followUp({
        content: '❌ Unknown subcommand.',
        ephemeral: true
      });
  }
}

/**
 * Handle faction spy subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {string} apiKey - User's Torn API key
 */
async function handleFactionSpy(interaction, client, apiKey) {
  const factionId = interaction.options.getString('faction_id');
  const includeDetails = interaction.options.getBoolean('include_details') || false;
  
  try {
    // Start gathering basic faction data
    await interaction.followUp({
      content: '🕵️ Gathering intelligence on faction ID ' + factionId + '...',
      ephemeral: true
    });
    
    // Get faction members with battle stats
    const membersData = await getFactionMembersStats(factionId, apiKey);
    
    // Check for error in response
    if (membersData.error) {
      let errorMessage = membersData.error.error || 'Unknown error';
      
      // Special handling for common errors
      if (membersData.error.code === 7) {
        errorMessage = `Faction ID ${factionId} doesn't exist or has been deleted.`;
      } else if (membersData.error.code === 5) {
        errorMessage = `You don't have permission to view this faction or you've provided an invalid API key.`;
      }
      
      return interaction.followUp({
        content: `❌ Error fetching faction data: ${errorMessage}`,
        ephemeral: true
      });
    }
    
    if (!membersData || membersData.length === 0) {
      return interaction.followUp({
        content: '❌ No data found for this faction, or you don\'t have access to view their members.',
        ephemeral: true
      });
    }
    
    // Get basic faction info
    const factionResponse = await fetch(`https://api.torn.com/faction/${factionId}?selections=basic&key=${apiKey}`);
    const factionData = await factionResponse.json();
    
    if (factionData.error) {
      let errorMessage = factionData.error.error || 'Unknown error';
      
      // Special handling for common errors
      if (factionData.error.code === 7) {
        errorMessage = `Faction ID ${factionId} doesn't exist or has been deleted.`;
      } else if (factionData.error.code === 5) {
        errorMessage = `You don't have permission to view this faction or you've provided an invalid API key.`;
      }
      
      return interaction.followUp({
        content: `❌ Error fetching faction data: ${errorMessage}`,
        ephemeral: true
      });
    }
    
    // Create the main faction intel embed
    const factionEmbed = new EmbedBuilder()
      .setTitle(`🕵️ Intelligence Report: ${factionData.name} [${factionId}]`)
      .setColor(Colors.DarkRed)
      .setDescription(`Battle intelligence gathered on faction members:`)
      .setFooter({ text: `${BOT_CONFIG.name} | Data may not be 100% accurate` })
      .setTimestamp();
    
    // Add faction general information
    factionEmbed.addFields(
      { name: 'Faction', value: `${factionData.name} [${factionId}]`, inline: true },
      { name: 'Age', value: `${Math.floor((Date.now() - new Date(factionData.founded * 1000)) / (1000 * 60 * 60 * 24))} days`, inline: true },
      { name: 'Members', value: `${membersData.length}`, inline: true },
      { name: 'Total Respect', value: `${factionData.respect.toLocaleString()}`, inline: true },
      { name: 'Best Players', value: 'See below for top members by battle stats', inline: false }
    );
    
    // Summary of top 5 members by battle stats
    let topMembersSummary = '';
    const topMembers = membersData.slice(0, 5);
    
    for (let i = 0; i < topMembers.length; i++) {
      const member = topMembers[i];
      const totalStats = member.stats?.calculatedStats?.totalBattleStats || 'Unknown';
      const formattedStats = typeof totalStats === 'number' ? totalStats.toLocaleString() : totalStats;
      topMembersSummary += `${i + 1}. **${member.name}** [${member.id}] - ${formattedStats} total battle stats\n`;
    }
    
    if (topMembersSummary) {
      factionEmbed.addFields({ name: 'Top 5 Faction Members', value: topMembersSummary });
    }
    
    // Prepare a detailed analysis embed if requested
    let detailedEmbed = null;
    if (includeDetails && membersData.length > 0) {
      detailedEmbed = new EmbedBuilder()
        .setTitle(`Detailed Analysis: ${factionData.name} [${factionId}]`)
        .setColor(Colors.DarkBlue)
        .setDescription(`In-depth analysis of faction members and their capabilities:`)
        .setFooter({ text: `${BOT_CONFIG.name} | Data may not be 100% accurate` })
        .setTimestamp();
      
      // Add detailed information about all faction members (up to 25 due to embed limits)
      const detailedMembers = membersData.slice(0, 15); // Limit to prevent embed limits
      
      let detailedAnalysis = '';
      for (const member of detailedMembers) {
        const stats = member.stats;
        const totalStats = stats?.calculatedStats?.totalBattleStats || 'Unknown';
        const activity = stats?.calculatedStats?.estimatedActivity || 'Unknown';
        
        detailedAnalysis += `**${member.name}** [${member.id}] - Level ${member.level}\n`;
        detailedAnalysis += `• Stats: ${typeof totalStats === 'number' ? totalStats.toLocaleString() : totalStats}\n`;
        detailedAnalysis += `• Activity: ${activity}\n`;
        detailedAnalysis += `• Last Action: ${stats?.last_action?.status || 'Unknown'}\n`;
        detailedAnalysis += '\n';
      }
      
      if (detailedAnalysis) {
        detailedEmbed.setDescription(detailedAnalysis);
      }
    }
    
    // Create a button to view more detailed analysis if there's a lot of data
    const row = new ActionRowBuilder();
    
    // Add button to view faction on Torn
    row.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('View Faction on Torn')
        .setURL(`https://www.torn.com/factions.php?step=profile&ID=${factionId}`)
    );
    
    // Send the main embed
    if (detailedEmbed) {
      await interaction.followUp({
        content: '🕵️ Intelligence report ready!',
        embeds: [factionEmbed, detailedEmbed],
        components: [row],
        ephemeral: true
      });
    } else {
      await interaction.followUp({
        content: '🕵️ Intelligence report ready!',
        embeds: [factionEmbed],
        components: [row],
        ephemeral: true
      });
    }
    
  } catch (error) {
    logError('Error in faction spy handler:', error);
    await interaction.followUp({
      content: '❌ Failed to gather complete intelligence on this faction. This could be due to API limitations or insufficient access rights.',
      ephemeral: true
    });
  }
}

/**
 * Handle player spy subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {string} apiKey - User's Torn API key
 */
async function handlePlayerSpy(interaction, client, apiKey) {
  const playerInput = interaction.options.getString('player_id_or_name');
  
  if (!playerInput || playerInput.trim() === '') {
    return interaction.followUp({
      content: '❌ Please provide a valid player ID or name.',
      ephemeral: true
    });
  }
  
  try {
    // Check if input is numeric (ID) or text (name)
    const isPlayerId = /^\d+$/.test(playerInput.trim());
    let playerId = isPlayerId ? playerInput.trim() : null;
    let playerName = isPlayerId ? null : playerInput.trim();
    
    // If input is a name, convert to ID using the lookup API
    if (!isPlayerId) {
      await interaction.followUp({
        content: `🔍 Looking up player named "${playerName}"...`,
        ephemeral: true
      });
      
      // Search for player by name using Torn's lookup API
      try {
        const searchResponse = await fetch(`https://api.torn.com/user/${apiKey}?selections=lookup&q=${encodeURIComponent(playerName)}`);
        const searchData = await searchResponse.json();
        
        // Handle API errors
        if (searchData.error) {
          let errorMessage = searchData.error.error || 'Unknown error';
          
          if (searchData.error.code === 5) {
            errorMessage = 'You don\'t have permission to search for players. Check that your API key has the correct permissions.';
          } else if (searchData.error.code === 9) {
            errorMessage = 'You are currently in a cooldown period. Please try again later.';
          }
          
          return interaction.followUp({
            content: `❌ Error searching for player: ${errorMessage}`,
            ephemeral: true
          });
        }
        
        // Check if we got any results
        if (!searchData.users || searchData.users.length === 0) {
          return interaction.followUp({
            content: `❌ No players found matching "${playerName}". Try using their exact Torn name or player ID instead.`,
            ephemeral: true
          });
        }
        
        // If we have multiple matches, show a list of the first few
        if (searchData.users.length > 1) {
          const matchCount = Math.min(searchData.users.length, 5); // Show up to 5 matches
          let matchMessage = `📋 Found ${searchData.users.length} players matching "${playerName}". Using the first match.\n\nMatches:`;
          
          for (let i = 0; i < matchCount; i++) {
            const user = searchData.users[i];
            matchMessage += `\n${i+1}. ${user.name} [${user.user_id}]${i === 0 ? ' ✓' : ''}`;
          }
          
          if (searchData.users.length > matchCount) {
            matchMessage += `\n...and ${searchData.users.length - matchCount} more`;
          }
          
          await interaction.followUp({
            content: matchMessage,
            ephemeral: true
          });
        }
        
        // Use the first match
        playerId = searchData.users[0].user_id;
        playerName = searchData.users[0].name;
      } catch (searchError) {
        logError('Error searching for player by name:', searchError);
        return interaction.followUp({
          content: `❌ Failed to find player named "${playerName}". The service might be unavailable or rate limited.`,
          ephemeral: true
        });
      }
    }
    
    // Start gathering intelligence
    await interaction.followUp({
      content: playerName 
        ? `🕵️ Gathering intelligence on ${playerName} [${playerId}]...`
        : `🕵️ Gathering intelligence on player ID ${playerId}...`,
      ephemeral: true
    });
    
    // Get player battle stats and information
    const playerStats = await getPlayerBattleStats(playerId, apiKey);
    
    if (!playerStats) {
      // Handle different error cases
      return interaction.followUp({
        content: `❌ Error fetching player data: Player ID ${playerId} not found or doesn't exist. Please check the ID and try again.`,
        ephemeral: true
      });
    }
    
    if (playerStats.error) {
      let errorMessage = playerStats.error.error || 'Unknown error';
      
      // Special handling for common errors
      if (playerStats.error.code === 7) {
        errorMessage = `Player ID ${playerId} doesn't exist or has been deleted.`;
      }
      
      return interaction.followUp({
        content: `❌ Error fetching player data: ${errorMessage}`,
        ephemeral: true
      });
    }
    
    // Get additional data from any additional API keys the user has
    let yataData = null;
    let tornstatsData = null;
    
    const yataKey = getUserApiKey(interaction.user.id, 'yata');
    const tornstatsKey = getUserApiKey(interaction.user.id, 'tornstats');
    
    if (yataKey) {
      try {
        // YATA API integration would go here
        // This is a placeholder for actual YATA integration
      } catch (yataError) {
        // Handle silently
      }
    }
    
    if (tornstatsKey) {
      try {
        // TornStats API integration would go here
        // This is a placeholder for actual TornStats integration
      } catch (tornstatsError) {
        // Handle silently
      }
    }
    
    // Create the player intelligence embed
    const playerEmbed = new EmbedBuilder()
      .setTitle(`🕵️ Intelligence Report: ${playerStats.name} [${playerId}]`)
      .setColor(Colors.DarkRed)
      .setDescription(`Battle intelligence gathered on this player:`)
      .setFooter({ text: `${BOT_CONFIG.name} | Data may not be 100% accurate` })
      .setTimestamp();
    
    // Add player general information
    playerEmbed.addFields(
      { name: 'Name', value: `${playerStats.name} [${playerId}]`, inline: true },
      { name: 'Level', value: `${playerStats.level || 'Unknown'}`, inline: true },
      { name: 'Faction', value: playerStats.faction?.faction_name ? `${playerStats.faction.faction_name} [${playerStats.faction.faction_id}]` : 'None', inline: true }
    );
    
    // Handle battle stats from different possible API structures
    const battleStats = playerStats.battlestats || playerStats;
    const strength = battleStats.strength;
    const defense = battleStats.defense;
    const speed = battleStats.speed;
    const dexterity = battleStats.dexterity;
    
    // Check if we have any stats available
    if (strength || defense || speed || dexterity) {
      const totalStats = (strength || 0) + (defense || 0) + (speed || 0) + (dexterity || 0);
      
      playerEmbed.addFields(
        { name: 'Battle Stats', value: 
          `💪 Strength: ${strength ? strength.toLocaleString() : 'Unknown'}\n` +
          `🛡️ Defense: ${defense ? defense.toLocaleString() : 'Unknown'}\n` +
          `🏃‍♂️ Speed: ${speed ? speed.toLocaleString() : 'Unknown'}\n` +
          `🎯 Dexterity: ${dexterity ? dexterity.toLocaleString() : 'Unknown'}\n` +
          `🔥 Total: ${totalStats ? totalStats.toLocaleString() : 'Unknown'}`
        }
      );
    } else if (playerStats.calculatedStats && playerStats.calculatedStats.totalBattleStats) {
      // If we have the calculated total but not individual stats
      playerEmbed.addFields(
        { name: 'Battle Stats', value: 
          `Total Battle Stats: ${playerStats.calculatedStats.totalBattleStats.toLocaleString()}\n` +
          `(Individual stats not visible with current API key permissions)`
        }
      );
    } else {
      playerEmbed.addFields(
        { name: 'Battle Stats', value: 'Unable to view battle stats with current API key permissions.' }
      );
    }
    
    // Add activity information
    // Handle different API response structures for last_action
    let lastAction = 'Unknown';
    if (playerStats.last_action && playerStats.last_action.status) {
      lastAction = playerStats.last_action.status;
    } else if (playerStats.last_action && typeof playerStats.last_action === 'string') {
      lastAction = playerStats.last_action;
    } else if (playerStats.profile && playerStats.profile.last_action) {
      lastAction = typeof playerStats.profile.last_action === 'string' ? 
                  playerStats.profile.last_action : 
                  playerStats.profile.last_action.status || 'Unknown';
    }
    
    playerEmbed.addFields(
      { name: 'Activity', value: 
        `Last Action: ${lastAction}\n` +
        `Activity Level: ${playerStats.calculatedStats?.estimatedActivity || 'Unknown'}`
      }
    );
    
    // Create a button to view more detailed analysis if there's a lot of data
    const row = new ActionRowBuilder();
    
    // Add button to view player on Torn
    row.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('View Player on Torn')
        .setURL(`https://www.torn.com/profiles.php?XID=${playerId}`)
    );
    
    // Send the player intelligence report
    await interaction.followUp({
      content: '🕵️ Intelligence report ready!',
      embeds: [playerEmbed],
      components: [row],
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in player spy handler:', error);
    await interaction.followUp({
      content: '❌ Failed to gather complete intelligence on this player. This could be due to API limitations or insufficient access rights.',
      ephemeral: true
    });
  }
}

module.exports = spyCommand;
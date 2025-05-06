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
const { getUserApiKey } = require('./apikey').apikeyCommand;

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
          option.setName('player_id')
            .setDescription('The ID or name of the player to spy on')
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
      return interaction.followUp({
        content: `❌ Error fetching faction data: ${factionData.error.error}`,
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
  const playerInput = interaction.options.getString('player_id');
  
  try {
    // Check if input is numeric (ID) or text (name)
    const isPlayerId = /^\d+$/.test(playerInput);
    let playerId = playerInput;
    
    // Convert name to ID if necessary
    if (!isPlayerId) {
      await interaction.followUp({
        content: `🔍 Looking up player named "${playerInput}"...`,
        ephemeral: true
      });
      
      // Search for player by name
      try {
        const searchResponse = await fetch(`https://api.torn.com/user/${apiKey}?selections=lookup&q=${encodeURIComponent(playerInput)}`);
        const searchData = await searchResponse.json();
        
        if (searchData.error) {
          return interaction.followUp({
            content: `❌ Error searching for player: ${searchData.error.error}`,
            ephemeral: true
          });
        }
        
        if (!searchData.users || searchData.users.length === 0) {
          return interaction.followUp({
            content: `❌ No players found matching "${playerInput}"`,
            ephemeral: true
          });
        }
        
        // Use the first match
        playerId = searchData.users[0].user_id;
      } catch (searchError) {
        logError('Error searching for player by name:', searchError);
        return interaction.followUp({
          content: `❌ Failed to find player named "${playerInput}"`,
          ephemeral: true
        });
      }
    }
    
    // Start gathering intelligence
    await interaction.followUp({
      content: '🕵️ Gathering intelligence on player ID ' + playerId + '...',
      ephemeral: true
    });
    
    // Get player battle stats and information
    const playerStats = await getPlayerBattleStats(playerId, apiKey);
    
    if (!playerStats || playerStats.error) {
      return interaction.followUp({
        content: `❌ Error fetching player data: ${playerStats?.error?.error || 'Unknown error'}`,
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
    
    // Add battle stats if available
    if (playerStats.strength || playerStats.defense || playerStats.speed || playerStats.dexterity) {
      const totalStats = (playerStats.strength || 0) + (playerStats.defense || 0) + 
                          (playerStats.speed || 0) + (playerStats.dexterity || 0);
      
      playerEmbed.addFields(
        { name: 'Battle Stats', value: 
          `💪 Strength: ${playerStats.strength ? playerStats.strength.toLocaleString() : 'Unknown'}\n` +
          `🛡️ Defense: ${playerStats.defense ? playerStats.defense.toLocaleString() : 'Unknown'}\n` +
          `🏃‍♂️ Speed: ${playerStats.speed ? playerStats.speed.toLocaleString() : 'Unknown'}\n` +
          `🎯 Dexterity: ${playerStats.dexterity ? playerStats.dexterity.toLocaleString() : 'Unknown'}\n` +
          `🔥 Total: ${totalStats ? totalStats.toLocaleString() : 'Unknown'}`
        }
      );
    } else {
      playerEmbed.addFields(
        { name: 'Battle Stats', value: 'Unable to view battle stats with current API key permissions.' }
      );
    }
    
    // Add activity information
    playerEmbed.addFields(
      { name: 'Activity', value: 
        `Last Action: ${playerStats.last_action?.status || 'Unknown'}\n` +
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
/**
 * API Connection Status Command
 * 
 * This command provides detailed information about the current API connection status,
 * including WebSocket and HTTP connections, active subscriptions, and metrics.
 */

const { 
  SlashCommandBuilder, 
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { log } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const { reconnectTornWS, resetAllConnections } = require('../torn-ws');

const commandName = 'apiconnection';

module.exports = {
  data: new SlashCommandBuilder()
    .setName(commandName)
    .setDescription('Check the status of Torn API connections and manage connectivity')
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View detailed information about API connection status'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reconnect')
        .setDescription('Reconnect to the Torn API WebSocket'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Perform a full reset of all API connections')),
        
  /**
   * Execute command
   * @param {CommandInteraction} interaction - Discord interaction object
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'status':
        await handleStatusSubcommand(interaction, client);
        break;
        
      case 'reconnect':
        await handleReconnectSubcommand(interaction, client);
        break;
        
      case 'reset':
        await handleResetSubcommand(interaction, client);
        break;
        
      default:
        await interaction.reply({
          content: '❌ Unknown subcommand.',
          ephemeral: true
        });
    }
  },
  
  /**
   * Handle button interactions for this command
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    const customId = interaction.customId;
    
    if (customId === 'reconnect_api') {
      await interaction.deferUpdate();
      
      log(`${interaction.user.tag} triggered API reconnect via button`);
      
      reconnectTornWS((data) => {
        client.tornData = data;
        log('Received updated Torn data after manual reconnect');
      });
      
      await interaction.editReply({
        content: '🔄 Reconnecting to Torn API... Check status in a few seconds to see the updated connection state.',
        components: []
      });
      
    } else if (customId === 'reset_api') {
      await interaction.deferUpdate();
      
      log(`${interaction.user.tag} triggered full API reset via button`);
      
      resetAllConnections((data) => {
        client.tornData = data;
        log('Received updated Torn data after full reset');
      });
      
      await interaction.editReply({
        content: '🔄 Performing full reset of all API connections... Check status in a few seconds to see the updated connection state.',
        components: []
      });
    }
  }
};

/**
 * Handle status subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleStatusSubcommand(interaction, client) {
  await interaction.deferReply();
  
  // Get connection status from global data
  let connectionStatus = null;
  
  try {
    // Get status from global connection data
    if (global.apiConnectionData) {
      connectionStatus = {
        http: {
          lastSuccessfulRequest: global.apiConnectionData.lastSuccessfulRequest || 0,
          requestStats: global.apiConnectionData.requestStats || { totalRequests: 0 }
        }
      };
    }
  } catch (error) {
    // If we can't access the status, we'll use approximated status
    log('Could not get direct connection status from API service');
  }
  
  // Create status embed
  const statusEmbed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle('Torn API Connection Status')
    .setDescription('Current status of connections to the Torn API')
    .setTimestamp()
    .setFooter({ text: BOT_CONFIG.name });
  
  // Add basic connection info that's always available
  const lastUpdate = client.tornData?.lastUpdate ? new Date(client.tornData.lastUpdate).toISOString() : 'No data received';
  const dataSource = client.tornData?.source || 'Unknown';
  
  statusEmbed.addFields(
    { name: 'Data Source', value: dataSource, inline: true },
    { name: 'Last Update', value: lastUpdate, inline: true }
  );
  
  // Add detailed connection info if available
  if (connectionStatus) {
    // If we have a last successful request timestamp, calculate how long ago it was
    const lastSuccessTime = connectionStatus.http.lastSuccessfulRequest;
    let lastSuccessDisplay = 'Never';
    let connectionStatusText = '🔴 Disconnected';
    
    if (lastSuccessTime > 0) {
      const now = Date.now();
      const secondsAgo = Math.floor((now - lastSuccessTime) / 1000);
      
      if (secondsAgo < 60) {
        lastSuccessDisplay = `${secondsAgo} seconds ago`;
        connectionStatusText = '🟢 Connected';
      } else if (secondsAgo < 3600) {
        const minutes = Math.floor(secondsAgo / 60);
        lastSuccessDisplay = `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        connectionStatusText = secondsAgo < 120 ? '🟢 Connected' : '🟡 Degraded';
      } else {
        const hours = Math.floor(secondsAgo / 3600);
        lastSuccessDisplay = `${hours} hour${hours === 1 ? '' : 's'} ago`;
        connectionStatusText = '🔴 Disconnected';
      }
    }
    
    // Add API connection status
    statusEmbed.addFields(
      { name: 'Connection Status', value: connectionStatusText, inline: true },
      { name: 'Last Successful Request', value: lastSuccessDisplay, inline: true }
    );
    
    // Add HTTP info if stats are available
    if (connectionStatus.http.requestStats) {
      const totalRequests = connectionStatus.http.requestStats.totalRequests || 0;
      const resetCount = connectionStatus.http.requestStats.resetCount || 0;
      
      statusEmbed.addFields(
        { name: 'Total API Requests', value: totalRequests.toString(), inline: true },
        { name: 'Connection Resets', value: resetCount.toString(), inline: true }
      );
      
      // If we have detailed endpoint timings, show them
      if (connectionStatus.http.requestStats.chain) {
        const lastChainRequestTime = new Date(connectionStatus.http.requestStats.chain).toISOString();
        statusEmbed.addFields(
          { name: 'Last Chain API Request', value: lastChainRequestTime, inline: false }
        );
      }
    }
  } else {
    // Fallback status display
    const chainData = client.tornData?.chain ? 'Available' : 'Not available';
    
    statusEmbed.addFields(
      { name: 'Chain Data', value: chainData, inline: true }
    );
  }
  
  // Create action buttons
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('reconnect_api')
        .setLabel('Reconnect API')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('reset_api')
        .setLabel('Full Reset')
        .setStyle(ButtonStyle.Danger)
    );
  
  await interaction.editReply({
    embeds: [statusEmbed],
    components: [row]
  });
}

/**
 * Handle reconnect subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleReconnectSubcommand(interaction, client) {
  await interaction.deferReply();
  
  log(`${interaction.user.tag} triggered API reconnect via command`);
  
  reconnectTornWS((data) => {
    client.tornData = data;
    log('Received updated Torn data after manual reconnect');
  });
  
  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle('API Reconnection Initiated')
    .setDescription('Reconnecting to the Torn API WebSocket...')
    .setTimestamp()
    .setFooter({ text: BOT_CONFIG.name });
  
  await interaction.editReply({
    embeds: [embed],
    content: 'Use `/apiconnection status` in a few seconds to see the updated connection state.'
  });
}

/**
 * Handle reset subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function handleResetSubcommand(interaction, client) {
  await interaction.deferReply();
  
  log(`${interaction.user.tag} triggered full API reset via command`);
  
  resetAllConnections((data) => {
    client.tornData = data;
    log('Received updated Torn data after full reset');
  });
  
  const embed = new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle('Full API Reset Initiated')
    .setDescription('Performing a full reset of all API connections...')
    .setTimestamp()
    .setFooter({ text: BOT_CONFIG.name });
  
  await interaction.editReply({
    embeds: [embed],
    content: 'Use `/apiconnection status` in a few seconds to see the updated connection state.'
  });
}
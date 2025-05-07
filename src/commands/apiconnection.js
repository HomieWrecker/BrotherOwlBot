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
  
  // Get connection status from client data
  const apiService = client.tornData?.apiService;
  let connectionStatus = null;
  
  try {
    if (apiService) {
      connectionStatus = apiService.getConnectionStatus();
    }
  } catch (error) {
    // If we can't access the service directly, we'll use approximated status
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
    const wsStatus = connectionStatus.websocket.connected ? '🟢 Connected' : '🔴 Disconnected';
    const reconnectAttempts = connectionStatus.websocket.reconnectAttempts;
    const subscriptions = connectionStatus.websocket.activeSubscriptions.join(', ') || 'None';
    
    statusEmbed.addFields(
      { name: 'WebSocket Status', value: wsStatus, inline: true },
      { name: 'Reconnect Attempts', value: reconnectAttempts.toString(), inline: true },
      { name: 'Active Subscriptions', value: subscriptions, inline: false }
    );
    
    // Add HTTP info
    statusEmbed.addFields(
      { name: 'HTTP Pending Requests', value: connectionStatus.http.pendingRequests.toString(), inline: true }
    );
    
    // Add last request times if available
    const lastRequests = Object.entries(connectionStatus.http.lastRequests)
      .map(([endpoint, time]) => `${endpoint}: ${new Date(time).toISOString()}`)
      .join('\n') || 'No recent requests';
      
    statusEmbed.addFields(
      { name: 'Recent HTTP Requests', value: lastRequests, inline: false }
    );
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
        .setLabel('Reconnect WebSocket')
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
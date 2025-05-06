const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  PermissionFlagsBits 
} = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatNumber } = require('../utils/formatting');
const { BOT_CONFIG } = require('../config');
const { getServerConfig, hasRequiredConfig } = require('../services/server-config');
const { 
  getPlayerBalance, 
  createBankRequest, 
  updateBankRequest, 
  markBankRequestNotified, 
  getBankRequest,
  getPendingBankRequests,
  getFulfilledNotNotifiedRequests,
  setBankConfig,
  generateBankURL
} = require('../services/bank-service');
const { getUserApiKey } = require('../commands/apikey');
const crypto = require('crypto');

// Bank command for faction banking operations
const bankCommand = {
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Faction banking operations')
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Configure faction bank settings (Admin only)')
        .addChannelOption(option =>
          option
            .setName('bank_channel')
            .setDescription('Channel for bank operations')
            .setRequired(true))
        .addRoleOption(option =>
          option
            .setName('banker_role')
            .setDescription('Role for faction bankers')
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('bank_message')
            .setDescription('Custom message to display on the bank embed')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Show faction bank information and balance'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('fulfill')
        .setDescription('Mark a bank request as fulfilled (Banker only)')
        .addStringOption(option =>
          option
            .setName('request_id')
            .setDescription('ID of the bank request to fulfill')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('cancel')
        .setDescription('Cancel a bank request (Banker or requester only)')
        .addStringOption(option =>
          option
            .setName('request_id')
            .setDescription('ID of the bank request to cancel')
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
  
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const { guildId, user } = interaction;
    
    // Handle bank setup (admin only)
    if (subcommand === 'setup') {
      // Check if user has admin permissions
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '❌ Only administrators can set up the faction bank.',
          ephemeral: true
        });
      }
      
      // Get options
      const bankChannel = interaction.options.getChannel('bank_channel');
      const bankerRole = interaction.options.getRole('banker_role');
      const bankMessage = interaction.options.getString('bank_message') || 
                         'Welcome to the faction bank! Use the button below to request a withdrawal.';
      
      // Create bank config
      const bankConfig = {
        channelId: bankChannel.id,
        bankerRoleId: bankerRole.id,
        message: bankMessage,
        setupDate: new Date().toISOString()
      };
      
      // Save bank config
      const success = setBankConfig(guildId, bankConfig);
      
      if (!success) {
        return interaction.reply({
          content: '❌ Error setting up faction bank. Please try again later.',
          ephemeral: true
        });
      }
      
      // Create bank embed in the specified channel
      try {
        // Build the bank embed
        const embed = new EmbedBuilder()
          .setTitle('💰 Faction Bank')
          .setColor(BOT_CONFIG.color)
          .setDescription(bankMessage)
          .addFields(
            { name: 'How to Withdraw', value: 'Click the button below to request a withdrawal.' },
            { name: 'Banker Role', value: `<@&${bankerRole.id}>` }
          )
          .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
          .setTimestamp();
        
        // Add a withdrawal button
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('bank_withdraw')
              .setLabel('Request Withdrawal')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('💰')
          );
        
        // Send the embed to the bank channel
        await bankChannel.send({
          embeds: [embed],
          components: [row]
        });
        
        // Confirmation message
        await interaction.reply({
          content: `✅ Faction bank set up successfully in <#${bankChannel.id}> with banker role <@&${bankerRole.id}>.`,
          ephemeral: true
        });
        
        log(`Faction bank set up in server ${interaction.guild.name} [${guildId}]`);
      } catch (error) {
        logError(`Error creating bank embed in channel ${bankChannel.id}:`, error);
        await interaction.reply({
          content: `❌ Error creating bank embed in <#${bankChannel.id}>. Make sure the bot has permission to send messages in this channel.`,
          ephemeral: true
        });
      }
    }
    
    // Handle bank show command
    else if (subcommand === 'show') {
      // Check if faction and bank are configured
      if (!hasRequiredConfig(guildId)) {
        return interaction.reply({
          content: '❌ Faction not configured. An administrator needs to set up the faction using `/faction setup`.',
          ephemeral: true
        });
      }
      
      const serverConfig = getServerConfig(guildId);
      if (!serverConfig.bankConfig) {
        return interaction.reply({
          content: '❌ Faction bank not configured. An administrator needs to set up the bank using `/bank setup`.',
          ephemeral: true
        });
      }
      
      // Get user's API key to check balance
      const apiKey = getUserApiKey(user.id);
      if (!apiKey) {
        return interaction.reply({
          content: '❌ You need to set up your API key first with `/apikey set`.',
          ephemeral: true
        });
      }
      
      // Check if there are any fulfilled but not notified requests for this user
      const fulfilledRequests = getFulfilledNotNotifiedRequests(guildId, user.id);
      if (fulfilledRequests.length > 0) {
        // Mark these requests as notified
        for (const request of fulfilledRequests) {
          markBankRequestNotified(guildId, request.id);
        }
        
        // Notify the user
        const totalAmount = fulfilledRequests.reduce((total, req) => total + req.amount, 0);
        await interaction.reply({
          content: `✅ Your bank withdrawal request${fulfilledRequests.length > 1 ? 's' : ''} for a total of $${formatNumber(totalAmount)} ${fulfilledRequests.length > 1 ? 'have' : 'has'} been fulfilled!`,
          ephemeral: true
        });
        return;
      }
      
      // Defer reply while we fetch data
      await interaction.deferReply({ ephemeral: true });
      
      try {
        // Fetch user information to get their Torn ID
        const userResponse = await fetch(`https://api.torn.com/user/?selections=basic&key=${apiKey}`);
        const userData = await userResponse.json();
        
        if (userData.error) {
          return interaction.editReply(`❌ API Error: ${userData.error.error}`);
        }
        
        const tornId = userData.player_id;
        const tornName = userData.name;
        
        // Fetch player's bank balance
        const balance = await getPlayerBalance(tornId, apiKey);
        
        if (balance === null) {
          return interaction.editReply('❌ Could not fetch your faction bank balance. Make sure your API key has the correct permissions.');
        }
        
        // Get bank configuration
        const { channelId, bankerRoleId } = serverConfig.bankConfig;
        
        // Check if there are any pending requests from this user
        const pendingRequests = getPendingBankRequests(guildId).filter(req => req.tornId === tornId.toString());
        
        // Create an embed with the player's bank information
        const embed = new EmbedBuilder()
          .setTitle('💰 Your Faction Bank Information')
          .setColor(BOT_CONFIG.color)
          .setDescription(`Here's your faction bank information, ${tornName}.`)
          .addFields(
            { name: 'Your Balance', value: `$${formatNumber(balance)}`, inline: true },
            { name: 'Bank Channel', value: `<#${channelId}>`, inline: true },
            { name: 'Banker Role', value: `<@&${bankerRoleId}>`, inline: true }
          )
          .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
          .setTimestamp();
        
        // Add pending requests if any
        if (pendingRequests.length > 0) {
          const requestsText = pendingRequests.map(req => 
            `• Request #${req.id.substring(0, 8)}: $${formatNumber(req.amount)} (${new Date(req.requestTime).toLocaleString()})`
          ).join('\n');
          
          embed.addFields({ 
            name: 'Your Pending Requests', 
            value: requestsText
          });
        }
        
        // Add a withdrawal button
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('bank_withdraw')
              .setLabel('Request Withdrawal')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('💰')
          );
        
        // Send the response
        await interaction.editReply({
          embeds: [embed],
          components: [row]
        });
      } catch (error) {
        logError('Error fetching bank information:', error);
        await interaction.editReply('❌ Error fetching bank information. Please try again later.');
      }
    }
    
    // Handle request fulfillment (banker only)
    else if (subcommand === 'fulfill') {
      // Check if faction and bank are configured
      if (!hasRequiredConfig(guildId) || !getServerConfig(guildId).bankConfig) {
        return interaction.reply({
          content: '❌ Faction bank not configured properly.',
          ephemeral: true
        });
      }
      
      const serverConfig = getServerConfig(guildId);
      const { bankerRoleId } = serverConfig.bankConfig;
      
      // Check if user has the banker role
      const hasBankerRole = interaction.member.roles.cache.has(bankerRoleId);
      if (!hasBankerRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: `❌ Only members with the <@&${bankerRoleId}> role can fulfill bank requests.`,
          ephemeral: true
        });
      }
      
      // Get the request ID
      const requestId = interaction.options.getString('request_id');
      
      // Check if the request exists
      const request = getBankRequest(guildId, requestId);
      if (!request) {
        return interaction.reply({
          content: `❌ Bank request #${requestId} not found.`,
          ephemeral: true
        });
      }
      
      // Check if the request is already fulfilled or cancelled
      if (request.status !== 'pending') {
        return interaction.reply({
          content: `❌ Bank request #${requestId} is already ${request.status}.`,
          ephemeral: true
        });
      }
      
      // Mark the request as fulfilled
      const success = updateBankRequest(guildId, requestId, 'fulfilled', user.id);
      
      if (!success) {
        return interaction.reply({
          content: '❌ Error fulfilling bank request. Please try again later.',
          ephemeral: true
        });
      }
      
      // Confirmation message
      await interaction.reply({
        content: `✅ Bank request #${requestId} has been marked as fulfilled. The user will be notified the next time they use a bank command.`,
        ephemeral: true
      });
      
      log(`Bank request ${requestId} fulfilled by ${user.tag} [${user.id}]`);
    }
    
    // Handle request cancellation (banker or requester only)
    else if (subcommand === 'cancel') {
      // Check if faction and bank are configured
      if (!hasRequiredConfig(guildId) || !getServerConfig(guildId).bankConfig) {
        return interaction.reply({
          content: '❌ Faction bank not configured properly.',
          ephemeral: true
        });
      }
      
      const serverConfig = getServerConfig(guildId);
      const { bankerRoleId } = serverConfig.bankConfig;
      
      // Get the request ID
      const requestId = interaction.options.getString('request_id');
      
      // Check if the request exists
      const request = getBankRequest(guildId, requestId);
      if (!request) {
        return interaction.reply({
          content: `❌ Bank request #${requestId} not found.`,
          ephemeral: true
        });
      }
      
      // Check if the request is already fulfilled or cancelled
      if (request.status !== 'pending') {
        return interaction.reply({
          content: `❌ Bank request #${requestId} is already ${request.status}.`,
          ephemeral: true
        });
      }
      
      // Check if user is the requester or has banker role
      const isRequester = request.userId === user.id;
      const hasBankerRole = interaction.member.roles.cache.has(bankerRoleId);
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      
      if (!isRequester && !hasBankerRole && !isAdmin) {
        return interaction.reply({
          content: '❌ Only the requester or someone with the banker role can cancel this request.',
          ephemeral: true
        });
      }
      
      // Mark the request as cancelled
      const success = updateBankRequest(guildId, requestId, 'cancelled', user.id);
      
      if (!success) {
        return interaction.reply({
          content: '❌ Error cancelling bank request. Please try again later.',
          ephemeral: true
        });
      }
      
      // Confirmation message
      await interaction.reply({
        content: `✅ Bank request #${requestId} has been cancelled.`,
        ephemeral: true
      });
      
      log(`Bank request ${requestId} cancelled by ${user.tag} [${user.id}]`);
    }
  },
  
  // Handle button interactions
  async handleButton(interaction, client) {
    if (interaction.customId === 'bank_withdraw') {
      const { guildId, user } = interaction;
      
      // Check if faction and bank are configured
      if (!hasRequiredConfig(guildId)) {
        return interaction.reply({
          content: '❌ Faction not configured. An administrator needs to set up the faction using `/faction setup`.',
          ephemeral: true
        });
      }
      
      const serverConfig = getServerConfig(guildId);
      if (!serverConfig.bankConfig) {
        return interaction.reply({
          content: '❌ Faction bank not configured. An administrator needs to set up the bank using `/bank setup`.',
          ephemeral: true
        });
      }
      
      // Get user's API key
      const apiKey = getUserApiKey(user.id);
      if (!apiKey) {
        return interaction.reply({
          content: '❌ You need to set up your API key first with `/apikey set`.',
          ephemeral: true
        });
      }
      
      try {
        // Fetch user information to get their Torn ID
        const userResponse = await fetch(`https://api.torn.com/user/?selections=basic&key=${apiKey}`);
        const userData = await userResponse.json();
        
        if (userData.error) {
          return interaction.reply({
            content: `❌ API Error: ${userData.error.error}`,
            ephemeral: true
          });
        }
        
        const tornId = userData.player_id;
        const tornName = userData.name;
        
        // Fetch player's bank balance
        const balance = await getPlayerBalance(tornId, apiKey);
        
        if (balance === null) {
          return interaction.reply({
            content: '❌ Could not fetch your faction bank balance. Make sure your API key has the correct permissions.',
            ephemeral: true
          });
        }
        
        // Check if there are any fulfilled but not notified requests for this user
        const fulfilledRequests = getFulfilledNotNotifiedRequests(guildId, user.id);
        if (fulfilledRequests.length > 0) {
          // Mark these requests as notified
          for (const request of fulfilledRequests) {
            markBankRequestNotified(guildId, request.id);
          }
          
          // Notify the user
          const totalAmount = fulfilledRequests.reduce((total, req) => total + req.amount, 0);
          return interaction.reply({
            content: `✅ Your bank withdrawal request${fulfilledRequests.length > 1 ? 's' : ''} for a total of $${formatNumber(totalAmount)} ${fulfilledRequests.length > 1 ? 'have' : 'has'} been fulfilled!`,
            ephemeral: true
          });
        }
        
        // Create a modal for withdrawal amount
        const modal = new ModalBuilder()
          .setCustomId(`bank_withdraw_modal_${tornId}_${tornName.replace(/[^a-zA-Z0-9]/g, '_')}`)
          .setTitle('Faction Bank Withdrawal');
        
        // Add a text input for the amount
        const amountInput = new TextInputBuilder()
          .setCustomId('withdraw_amount')
          .setLabel(`Your Balance: $${formatNumber(balance)}`)
          .setPlaceholder('Enter amount to withdraw (e.g. 1000000)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(15);
        
        // Add a text input for the reason (optional)
        const reasonInput = new TextInputBuilder()
          .setCustomId('withdraw_reason')
          .setLabel('Reason (Optional)')
          .setPlaceholder('Enter reason for withdrawal (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100);
        
        // Add inputs to the modal
        const amountRow = new ActionRowBuilder().addComponents(amountInput);
        const reasonRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(amountRow, reasonRow);
        
        // Show the modal
        await interaction.showModal(modal);
      } catch (error) {
        logError('Error preparing withdrawal modal:', error);
        await interaction.reply({
          content: '❌ Error preparing withdrawal form. Please try again later.',
          ephemeral: true
        });
      }
    }
  },
  
  // Handle modal submissions
  async handleModal(interaction, client) {
    if (interaction.customId.startsWith('bank_withdraw_modal_')) {
      const { guildId, user } = interaction;
      
      // Extract Torn ID and name from the modal ID
      const modalIdParts = interaction.customId.split('_');
      const tornId = modalIdParts[3];
      // We don't need to reconstruct tornName as we'll get it from the API again
      
      // Get withdrawal amount
      const amountInput = interaction.fields.getTextInputValue('withdraw_amount');
      const reason = interaction.fields.getTextInputValue('withdraw_reason') || 'No reason provided';
      
      // Parse and validate amount
      let amount;
      try {
        // Remove commas and other non-numeric characters
        amount = parseInt(amountInput.replace(/[^0-9]/g, ''));
        
        if (isNaN(amount) || amount <= 0) {
          return interaction.reply({
            content: '❌ Please enter a valid positive number for the withdrawal amount.',
            ephemeral: true
          });
        }
      } catch (error) {
        return interaction.reply({
          content: '❌ Invalid amount format. Please enter a valid number.',
          ephemeral: true
        });
      }
      
      // Get server configuration
      const serverConfig = getServerConfig(guildId);
      const { bankerRoleId, channelId } = serverConfig.bankConfig;
      
      // Get banker channel
      const bankerChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (!bankerChannel) {
        return interaction.reply({
          content: '❌ Bank channel not found. Please contact an administrator.',
          ephemeral: true
        });
      }
      
      try {
        // Generate a unique request ID
        const requestId = crypto.randomBytes(4).toString('hex');
        
        // Create bank request
        const success = createBankRequest(guildId, requestId, user.id, tornId, tornId, amount);
        
        if (!success) {
          return interaction.reply({
            content: '❌ Error creating bank request. Please try again later.',
            ephemeral: true
          });
        }
        
        // Create withdrawal request embed
        const embed = new EmbedBuilder()
          .setTitle('💰 Bank Withdrawal Request')
          .setColor(BOT_CONFIG.color)
          .setDescription(`A faction member has requested a bank withdrawal.`)
          .addFields(
            { name: 'Member', value: `<@${user.id}> (${tornId})`, inline: true },
            { name: 'Amount', value: `$${formatNumber(amount)}`, inline: true },
            { name: 'Request ID', value: requestId, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { 
              name: 'Instructions for Bankers', 
              value: `1. Go to [Faction Bank](https://www.torn.com/factions.php?step=your#/tab=bank)\n` +
                     `2. Enter amount: $${formatNumber(amount)}\n` + 
                     `3. Enter ID: ${tornId}\n` +
                     `4. After sending the money, use \`/bank fulfill request_id:${requestId}\``
            }
          )
          .setTimestamp()
          .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Request ID: ${requestId}` });
        
        // Create action buttons
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Go to Faction Bank')
              .setStyle(ButtonStyle.Link)
              .setURL(generateBankURL(tornId, amount)),
            new ButtonBuilder()
              .setCustomId(`bank_fulfill_${requestId}`)
              .setLabel('Mark as Fulfilled')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`bank_cancel_${requestId}`)
              .setLabel('Cancel Request')
              .setStyle(ButtonStyle.Danger)
          );
        
        // Send to banker channel and ping the banker role
        await bankerChannel.send({
          content: `<@&${bankerRoleId}> New withdrawal request from <@${user.id}> for $${formatNumber(amount)}`,
          embeds: [embed],
          components: [row]
        });
        
        // Confirmation to the user
        await interaction.reply({
          content: `✅ Your withdrawal request for $${formatNumber(amount)} has been submitted! A banker will process your request soon.`,
          ephemeral: true
        });
        
        log(`Bank withdrawal request created by ${user.tag} [${user.id}] for $${formatNumber(amount)}`);
      } catch (error) {
        logError('Error processing withdrawal request:', error);
        await interaction.reply({
          content: '❌ Error processing your withdrawal request. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};

module.exports = { bankCommand };
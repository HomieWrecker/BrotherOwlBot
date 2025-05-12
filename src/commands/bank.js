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
const keyStorageService = require('../services/key-storage-service');
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
      try {
        const apiKey = await keyStorageService.getApiKey(user.id, 'torn');
        if (!apiKey) {
          return interaction.reply({
            content: '❌ You need to set up your API key first with `/apikey`.',
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
      } catch (error) {
        logError('Error retrieving API key:', error);
        await interaction.reply({
          content: '❌ Error retrieving your API key. Please try again later.',
          ephemeral: true
        });
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
    if (interaction.customId === 'bank_withdraw' || 
        interaction.customId.startsWith('bank_fulfill_') || 
        interaction.customId.startsWith('bank_cancel_')) {
      
      const { guildId, user } = interaction;
      
      // Handle fulfill request button
      if (interaction.customId.startsWith('bank_fulfill_')) {
        const requestId = interaction.customId.replace('bank_fulfill_', '');
        
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
        
        // Check if the request exists
        const request = getBankRequest(guildId, requestId);
        if (!request) {
          return interaction.reply({
            content: `❌ Bank request #${requestId.substring(0, 8)} not found or may have been removed.`,
            ephemeral: true
          });
        }
        
        // Check if the request is already fulfilled or cancelled
        if (request.status !== 'pending') {
          return interaction.reply({
            content: `❌ Bank request #${requestId.substring(0, 8)} is already ${request.status}.`,
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
          content: `✅ Bank request #${requestId.substring(0, 8)} has been marked as fulfilled. The user will be notified the next time they use a bank command.`,
          ephemeral: true
        });
        
        // Update the original message to show fulfilled status
        try {
          // Disable the buttons on the original message
          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`bank_fulfill_${requestId}`)
                .setLabel('Request Fulfilled')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`bank_cancel_${requestId}`)
                .setLabel('Cancel Request')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
                .setDisabled(true),
              new ButtonBuilder()
                .setURL(generateBankURL(request.tornId, request.amount))
                .setLabel('Go to Faction Bank')
                .setStyle(ButtonStyle.Link)
                .setEmoji('🔗')
            );
          
          // Update the message
          await interaction.message.edit({
            content: `✅ Request fulfilled by <@${user.id}>`,
            components: [row]
          });
        } catch (error) {
          logError('Error updating bank request message:', error);
          // Not critical, so we'll continue
        }
        
        log(`Bank request ${requestId} fulfilled by ${user.tag} [${user.id}]`);
        return;
      }
      
      // Handle cancel request button
      if (interaction.customId.startsWith('bank_cancel_')) {
        const requestId = interaction.customId.replace('bank_cancel_', '');
        
        // Check if faction and bank are configured
        if (!hasRequiredConfig(guildId) || !getServerConfig(guildId).bankConfig) {
          return interaction.reply({
            content: '❌ Faction bank not configured properly.',
            ephemeral: true
          });
        }
        
        const serverConfig = getServerConfig(guildId);
        const { bankerRoleId } = serverConfig.bankConfig;
        
        // Check if the request exists
        const request = getBankRequest(guildId, requestId);
        if (!request) {
          return interaction.reply({
            content: `❌ Bank request #${requestId.substring(0, 8)} not found or may have been removed.`,
            ephemeral: true
          });
        }
        
        // Check if the request is already fulfilled or cancelled
        if (request.status !== 'pending') {
          return interaction.reply({
            content: `❌ Bank request #${requestId.substring(0, 8)} is already ${request.status}.`,
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
          content: `✅ Bank request #${requestId.substring(0, 8)} has been cancelled.`,
          ephemeral: true
        });
        
        // Update the original message to show cancelled status
        try {
          // Disable the buttons on the original message
          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`bank_fulfill_${requestId}`)
                .setLabel('Mark as Fulfilled')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`bank_cancel_${requestId}`)
                .setLabel('Request Cancelled')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
                .setDisabled(true),
              new ButtonBuilder()
                .setURL(generateBankURL(request.tornId, request.amount))
                .setLabel('Go to Faction Bank')
                .setStyle(ButtonStyle.Link)
                .setEmoji('🔗')
            );
          
          // Update the message
          await interaction.message.edit({
            content: `❌ Request cancelled by <@${user.id}>`,
            components: [row]
          });
        } catch (error) {
          logError('Error updating bank request message:', error);
          // Not critical, so we'll continue
        }
        
        log(`Bank request ${requestId} cancelled by ${user.tag} [${user.id}]`);
        return;
      }
      
      // Handle withdraw button (the original code)
      if (interaction.customId === 'bank_withdraw') {
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
        try {
          const apiKey = await keyStorageService.getApiKey(user.id, 'torn');
          if (!apiKey) {
            return interaction.reply({
              content: '❌ You need to set up your API key first with `/apikey`.',
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
            
            // Create the withdrawal modal
            const modal = new ModalBuilder()
              .setCustomId(`bank_withdraw_modal_${guildId}`)
              .setTitle('Bank Withdrawal Request');
            
            // Add the amount input
            const amountInput = new TextInputBuilder()
              .setCustomId('bank_withdraw_amount')
              .setLabel('Amount to withdraw (in $)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Enter amount (e.g. 1000000)')
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(15);
            
            // Add the reason input (optional)
            const reasonInput = new TextInputBuilder()
              .setCustomId('bank_withdraw_reason')
              .setLabel('Reason for withdrawal (optional)')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Enter reason for your withdrawal request')
              .setRequired(false)
              .setMaxLength(500);
            
            // Create the action rows for the inputs
            const amountRow = new ActionRowBuilder().addComponents(amountInput);
            const reasonRow = new ActionRowBuilder().addComponents(reasonInput);
            
            // Add the rows to the modal
            modal.addComponents(amountRow, reasonRow);
            
            // Store user data in client for retrieval in modal submission
            if (!client.bankWithdrawals) {
              client.bankWithdrawals = {};
            }
            
            const requestId = crypto.randomBytes(16).toString('hex');
            client.bankWithdrawals[`${user.id}_${guildId}`] = {
              tornId,
              tornName,
              requestId
            };
            
            // Show the modal
            await interaction.showModal(modal);
          } catch (error) {
            logError('Error preparing withdrawal modal:', error);
            await interaction.reply({
              content: '❌ Error preparing withdrawal form. Please try again later.',
              ephemeral: true
            });
          }
        } catch (error) {
          logError('Error retrieving API key:', error);
          await interaction.reply({
            content: '❌ Error retrieving your API key. Please try again later.',
            ephemeral: true
          });
        }
      }
    }
  },
  
  // Handle modal submissions
  async handleModal(interaction, client) {
    if (interaction.customId.startsWith('bank_withdraw_modal_')) {
      const { guildId, user } = interaction;
      
      // Retrieve user data from client
      if (!client.bankWithdrawals || !client.bankWithdrawals[`${user.id}_${guildId}`]) {
        return interaction.reply({
          content: '❌ Session expired. Please try again.',
          ephemeral: true
        });
      }
      
      const { tornId, tornName, requestId } = client.bankWithdrawals[`${user.id}_${guildId}`];
      
      // Get form values
      const amountStr = interaction.fields.getTextInputValue('bank_withdraw_amount');
      const reason = interaction.fields.getTextInputValue('bank_withdraw_reason') || 'No reason provided';
      
      // Parse and validate amount
      let amount;
      try {
        // Remove commas and dollar signs if present
        const cleanAmount = amountStr.replace(/[$,]/g, '');
        amount = parseInt(cleanAmount, 10);
        
        if (isNaN(amount) || amount <= 0) {
          return interaction.reply({
            content: '❌ Please enter a valid withdrawal amount.',
            ephemeral: true
          });
        }
      } catch (error) {
        return interaction.reply({
          content: '❌ Invalid amount format. Please enter a number.',
          ephemeral: true
        });
      }
      
      // Create the bank request
      const success = createBankRequest(guildId, requestId, user.id, tornId, tornName, amount);
      
      if (!success) {
        return interaction.reply({
          content: '❌ Error creating bank request. Please try again later.',
          ephemeral: true
        });
      }
      
      // Get server config for the banker role
      const serverConfig = getServerConfig(guildId);
      const { channelId, bankerRoleId } = serverConfig.bankConfig;
      
      // Send confirmation to user
      await interaction.reply({
        content: `✅ Bank withdrawal request submitted for $${formatNumber(amount)}.\nRequest ID: \`${requestId.substring(0, 8)}\`\nA banker will process your request soon.`,
        ephemeral: true
      });
      
      // Notify the bank channel
      try {
        const channel = await client.channels.fetch(channelId);
        
        // Create bank request embed
        const embed = new EmbedBuilder()
          .setTitle('💰 New Bank Withdrawal Request')
          .setColor(BOT_CONFIG.color)
          .setDescription(`A new bank withdrawal request has been submitted.`)
          .addFields(
            { name: 'Requester', value: `${tornName} [${tornId}]`, inline: true },
            { name: 'Amount', value: `$${formatNumber(amount)}`, inline: true },
            { name: 'Request ID', value: requestId.substring(0, 8), inline: true },
            { name: 'Reason', value: reason }
          )
          .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
          .setTimestamp();
        
        // Add fulfillment buttons
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`bank_fulfill_${requestId}`)
              .setLabel('Mark as Fulfilled')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`bank_cancel_${requestId}`)
              .setLabel('Cancel Request')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌'),
            new ButtonBuilder()
              .setURL(generateBankURL(tornId, amount))
              .setLabel('Go to Faction Bank')
              .setStyle(ButtonStyle.Link)
              .setEmoji('🔗')
          );
        
        // Send to channel with a ping to the banker role
        await channel.send({
          content: `<@&${bankerRoleId}> New bank withdrawal request!`,
          embeds: [embed],
          components: [row]
        });
        
        log(`Bank withdrawal request ${requestId} created for ${tornName} [${tornId}]: $${formatNumber(amount)}`);
      } catch (error) {
        logError(`Error notifying bank channel about request ${requestId}:`, error);
        // We already confirmed to the user, so we don't need to send an error
      }
      
      // Clean up temp data
      delete client.bankWithdrawals[`${user.id}_${guildId}`];
    }
  }
};

module.exports = bankCommand;
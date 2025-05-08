const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { formatDate } = require('../utils/formatting');
const { BOT_CONFIG } = require('../config');
const { getServerConfig, updateServerConfig, hasRequiredConfig } = require('../services/server-config');

// Faction setup command - allows server admins to configure faction settings
const factionCommand = {
  data: new SlashCommandBuilder()
    .setName('faction')
    .setDescription('Configure faction settings for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Set up faction details for this server')
        .addStringOption(option => 
          option
            .setName('faction_id')
            .setDescription('Your Torn faction ID')
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('api_key')
            .setDescription('API key with faction access (ideally a leader/co-leader key)')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('alerts')
        .setDescription('Configure chain alerts')
        .addRoleOption(option =>
          option
            .setName('ping_role')
            .setDescription('Role to ping for chain alerts')
            .setRequired(true))
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable chain alerts')
            .setRequired(true))
        .addIntegerOption(option =>
          option
            .setName('min_chain')
            .setDescription('Minimum chain count to trigger alerts (default: 10)')
            .setRequired(false))
        .addIntegerOption(option =>
          option
            .setName('warning_time')
            .setDescription('Warning time in minutes before chain expires (default: 1)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('attacks')
        .setDescription('Configure attack monitoring')
        .addChannelOption(option =>
          option
            .setName('monitor_channel')
            .setDescription('Channel to post attack notifications')
            .setRequired(true))
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable attack monitoring')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View faction configuration for this server')),
  
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const { guildId, guild } = interaction;
    
    // Handle faction setup
    if (subcommand === 'setup') {
      const factionId = interaction.options.getString('faction_id');
      const apiKey = interaction.options.getString('api_key');
      
      // Verify API key has faction access
      await interaction.deferReply({ ephemeral: true });
      
      try {
        // Test the API key with a faction endpoint
        const response = await fetch(`https://api.torn.com/faction/${factionId}?selections=basic&key=${apiKey}`);
        const data = await response.json();
        
        if (data.error) {
          return interaction.editReply({
            content: `❌ API key error: ${data.error.error}. Make sure the key has faction access permissions.`
          });
        }
        
        // Save the faction configuration
        const factionName = data.name;
        updateServerConfig(guildId, 'factionId', factionId);
        updateServerConfig(guildId, 'factionApiKey', apiKey);
        updateServerConfig(guildId, 'factionName', factionName);
        updateServerConfig(guildId, 'setupDate', new Date().toISOString());
        
        // Success message
        const embed = new EmbedBuilder()
          .setTitle('✅ Faction Setup Complete')
          .setColor(BOT_CONFIG.color)
          .setDescription(`Your faction has been successfully configured for this server.`)
          .addFields(
            { name: 'Faction', value: `${factionName} [${factionId}]`, inline: true },
            { name: 'API Access', value: 'Verified ✓', inline: true },
            { name: 'Setup Date', value: formatDate(new Date()), inline: true }
          )
          .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
        
        // Initial defaults for alerts and monitoring
        updateServerConfig(guildId, 'chainAlerts', {
          enabled: false,
          minChain: 10,
          warningTime: 1, // minutes
          pingRole: null
        });
        
        updateServerConfig(guildId, 'attackMonitoring', {
          enabled: false,
          monitorChannel: null
        });
        
        await interaction.editReply({
          embeds: [embed],
          content: 'Now you can set up chain alerts with `/faction alerts` and attack monitoring with `/faction attacks`.'
        });
        
        log(`Faction ${factionName} [${factionId}] set up for server ${guild.name} [${guildId}]`);
      } catch (error) {
        logError(`Error setting up faction for server ${guildId}:`, error);
        await interaction.editReply({
          content: '❌ Error setting up faction configuration. Please try again later or check API key permissions.'
        });
      }
    }
    
    // Handle chain alerts setup
    else if (subcommand === 'alerts') {
      // Ensure faction is set up first
      if (!hasRequiredConfig(guildId)) {
        return interaction.reply({
          content: '❌ You need to set up your faction first with `/faction setup`.',
          ephemeral: true
        });
      }
      
      const pingRole = interaction.options.getRole('ping_role');
      const enabled = interaction.options.getBoolean('enabled');
      const minChain = interaction.options.getInteger('min_chain') || 10;
      const warningTime = interaction.options.getInteger('warning_time') || 1;
      
      // Update chain alerts configuration
      updateServerConfig(guildId, 'chainAlerts', {
        enabled,
        minChain,
        warningTime,
        pingRole: pingRole.id
      });
      
      // Create success embed
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Chain Alerts Configuration')
        .setColor(BOT_CONFIG.color)
        .setDescription(`Chain alerts have been ${enabled ? 'enabled' : 'disabled'} for this server.`)
        .addFields(
          { name: 'Status', value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Ping Role', value: `<@&${pingRole.id}>`, inline: true },
          { name: 'Alert Conditions', value: `Chain ≥ ${minChain} hits\nTime remaining ≤ ${warningTime} min`, inline: true }
        )
        .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
      
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
      
      log(`Chain alerts ${enabled ? 'enabled' : 'disabled'} for server ${guild.name} [${guildId}]`);
    }
    
    // Handle attack monitoring setup
    else if (subcommand === 'attacks') {
      // Ensure faction is set up first
      if (!hasRequiredConfig(guildId)) {
        return interaction.reply({
          content: '❌ You need to set up your faction first with `/faction setup`.',
          ephemeral: true
        });
      }
      
      const monitorChannel = interaction.options.getChannel('monitor_channel');
      const enabled = interaction.options.getBoolean('enabled');
      
      // Verify channel permissions
      try {
        const permissions = monitorChannel.permissionsFor(client.user);
        if (!permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
          return interaction.reply({
            content: `❌ I don't have permission to send messages in <#${monitorChannel.id}>. Please adjust my permissions.`,
            ephemeral: true
          });
        }
      } catch (error) {
        return interaction.reply({
          content: `❌ Error checking channel permissions: ${error.message}`,
          ephemeral: true
        });
      }
      
      // Update attack monitoring configuration
      updateServerConfig(guildId, 'attackMonitoring', {
        enabled,
        monitorChannel: monitorChannel.id
      });
      
      // Create success embed
      const embed = new EmbedBuilder()
        .setTitle('👀 Attack Monitoring Configuration')
        .setColor(BOT_CONFIG.color)
        .setDescription(`Attack monitoring has been ${enabled ? 'enabled' : 'disabled'} for this server.`)
        .addFields(
          { name: 'Status', value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Monitor Channel', value: `<#${monitorChannel.id}>`, inline: true }
        )
        .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
      
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
      
      log(`Attack monitoring ${enabled ? 'enabled' : 'disabled'} for server ${guild.name} [${guildId}]`);
    }
    
    // Handle configuration view
    else if (subcommand === 'view') {
      const config = getServerConfig(guildId);
      
      if (!config || !config.factionId) {
        return interaction.reply({
          content: '❌ No faction configuration found for this server. Use `/faction setup` to configure.',
          ephemeral: true
        });
      }
      
      // Create configuration embed
      const embed = new EmbedBuilder()
        .setTitle('🔧 Faction Configuration')
        .setColor(BOT_CONFIG.color)
        .setDescription(`Current faction configuration for **${guild.name}**`)
        .addFields(
          { name: 'Faction', value: `${config.factionName || 'Unknown'} [${config.factionId}]`, inline: true },
          { name: 'Setup Date', value: config.setupDate ? formatDate(new Date(config.setupDate)) : 'Unknown', inline: true }
        )
        .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` });
      
      // Add chain alerts info if configured
      if (config.chainAlerts) {
        embed.addFields({
          name: '⚡ Chain Alerts',
          value: `Status: ${config.chainAlerts.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                 `Minimum Chain: ${config.chainAlerts.minChain || 10} hits\n` +
                 `Warning Time: ${config.chainAlerts.warningTime || 1} minute(s)\n` +
                 `Ping Role: ${config.chainAlerts.pingRole ? `<@&${config.chainAlerts.pingRole}>` : 'Not set'}`,
          inline: false
        });
      }
      
      // Add attack monitoring info if configured
      if (config.attackMonitoring) {
        embed.addFields({
          name: '🔍 Attack Monitoring',
          value: `Status: ${config.attackMonitoring.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                 `Channel: ${config.attackMonitoring.monitorChannel ? `<#${config.attackMonitoring.monitorChannel}>` : 'Not set'}`,
          inline: false
        });
      }
      
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }
  }
};

module.exports = { factionCommand };
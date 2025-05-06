const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatDate } = require('../utils/formatting');
const { log } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const { SERVICES, checkServiceAvailability } = require('../services/integrations');

// Status command - provides information about the bot and API status
const statusCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Get information about the bot and API status'),
  
  async execute(interaction, client) {
    // Defer reply to give time to process
    await interaction.deferReply();
    
    // Get bot uptime
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeString = `${hours}h ${minutes}m ${seconds}s`;
    
    // Create rich embed for status data
    const embed = new EmbedBuilder()
      .setTitle('🦉 BrotherOwlManager Status')
      .setColor(BOT_CONFIG.color)
      .setTimestamp()
      .addFields(
        { name: 'Bot Status', value: '✅ Online', inline: true },
        { name: 'Version', value: BOT_CONFIG.version, inline: true },
        { name: 'Uptime', value: uptimeString, inline: true },
        { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
        { name: 'Torn API', value: client.tornData ? '✅ Connected' : '❌ Disconnected', inline: true }
      );
    
    // Add last data update time if available
    if (client.tornData && client.tornData.lastUpdate) {
      const lastUpdate = new Date(client.tornData.lastUpdate);
      embed.addFields(
        { name: 'Last Data Update', value: formatDate(lastUpdate), inline: true }
      );
    }
    
    // Add server info
    embed.addFields(
      { name: 'Server Count', value: `${client.guilds.cache.size}`, inline: true },
      { name: 'Commands', value: `${client.commands.size}`, inline: true }
    );
    
    // Check external service availability
    try {
      const serviceStatuses = [];
      
      // Check each service availability
      const tornStatus = await checkServiceAvailability(SERVICES.TORN);
      serviceStatuses.push(`Torn API: ${tornStatus ? '✅' : '❌'}`);
      
      const yataStatus = await checkServiceAvailability(SERVICES.YATA);
      serviceStatuses.push(`YATA: ${yataStatus ? '✅' : '❌'}`);
      
      const anarchyStatus = await checkServiceAvailability(SERVICES.ANARCHY);
      serviceStatuses.push(`Anarchy: ${anarchyStatus ? '✅' : '❌'}`);
      
      const tornstatsStatus = await checkServiceAvailability(SERVICES.TORNSTATS);
      serviceStatuses.push(`TornStats: ${tornstatsStatus ? '✅' : '❌'}`);
      
      const torntoolsStatus = await checkServiceAvailability(SERVICES.TORNTOOLS);
      serviceStatuses.push(`TornTools: ${torntoolsStatus ? '✅' : '❌'}`);
      
      const tortoiseStatus = await checkServiceAvailability(SERVICES.TORTOISE);
      serviceStatuses.push(`Tortoise: ${tortoiseStatus ? '✅' : '❌'}`);
      
      // Add external services status field
      embed.addFields({
        name: 'External Services',
        value: serviceStatuses.join('\n'),
        inline: false
      });
    } catch (error) {
      embed.addFields({
        name: 'External Services',
        value: 'Error checking service availability',
        inline: false
      });
    }
    
    embed.setFooter({ 
      text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}`
    });
    
    await interaction.editReply({ embeds: [embed] });
  }
};

module.exports = { statusCommand };
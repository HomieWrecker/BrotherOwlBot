const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatTimeRemaining } = require('../utils/formatting');
const { log } = require('../utils/logger');

// Chain command - provides information about the faction's current chain
const chainCommand = {
  data: new SlashCommandBuilder()
    .setName('chain')
    .setDescription('Get information about the faction\'s current chain status'),
  
  async execute(interaction, client) {
    // Defer reply to give time to process
    await interaction.deferReply();
    
    // Check if Torn data is available
    if (!client.tornData || !client.tornData.chain) {
      return interaction.editReply({
        content: '⏳ No chain data available yet. Please try again in a moment.',
        ephemeral: true
      });
    }
    
    const chainData = client.tornData.chain;
    
    // Create rich embed for chain data
    const embed = new EmbedBuilder()
      .setTitle('🦉 BrotherOwlManager Chain Status')
      .setColor(0x8B4513) // Brown color for owl theme
      .setTimestamp();
    
    if (chainData.current > 0) {
      // Active chain
      embed.addFields(
        { name: 'Current Count', value: `${chainData.current.toLocaleString()}`, inline: true },
        { name: 'Timeout', value: formatTimeRemaining(chainData.timeout), inline: true }
      );
      
      // Add cooldown if available
      if (chainData.cooldown) {
        embed.addFields(
          { name: 'Cooldown', value: formatTimeRemaining(chainData.cooldown), inline: true }
        );
      }
      
      // Add bonus information if available
      if (chainData.modifier) {
        embed.addFields(
          { name: 'Bonus', value: `${chainData.modifier}x`, inline: true }
        );
      }
      
      embed.setDescription('The faction chain is active! 🔥');
    } else {
      // No active chain
      embed.setDescription('There is no active chain at the moment. 😴')
        .addFields(
          { name: 'Chain Status', value: 'Inactive', inline: true }
        );
      
      // Add cooldown if available
      if (chainData.cooldown) {
        embed.addFields(
          { name: 'Cooldown', value: formatTimeRemaining(chainData.cooldown), inline: true }
        );
      }
    }
    
    // Add footer with refresh info
    embed.setFooter({ 
      text: 'Data updates in real-time via WebSocket'
    });
    
    await interaction.editReply({ embeds: [embed] });
  }
};

module.exports = { chainCommand };

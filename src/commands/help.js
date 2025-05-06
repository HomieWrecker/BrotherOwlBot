const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { log } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');

// Help command - provides information about all available commands
const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help with BrotherOwl commands'),
  
  async execute(interaction, client) {
    // Get all available commands from the client's commands collection
    const commands = Array.from(client.commands.values());
    
    // Create rich embed for help data
    const embed = new EmbedBuilder()
      .setTitle('🦉 BrotherOwl Help')
      .setDescription('Here are all available commands for BrotherOwl:')
      .setColor(BOT_CONFIG.color)
      .setTimestamp();
    
    // Add each command to the embed
    commands.forEach(command => {
      embed.addFields({ 
        name: `/${command.data.name}`, 
        value: command.data.description
      });
    });
    
    // Add footer with version info
    embed.setFooter({ 
      text: `BrotherOwl v${BOT_CONFIG.version}`
    });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    log(`Help command executed by ${interaction.user.tag}`);
  }
};

module.exports = { helpCommand };
/**
 * Activity Heat Map command for BrotherOwlManager
 * Visualizes faction member activity patterns over time
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, MessageSelectMenu, MessageButton } = require('discord.js');
const { log, logError } = require('../utils/logger');
const { getUserApiKey } = require('./apikey');
const activityHeatmap = require('../services/activity-heatmap');

// Isolated error handling to prevent disrupting the bot
async function safeExecute(callback) {
  try {
    return await callback();
  } catch (error) {
    logError('Error in activity heat map command:', error);
    return {
      error: true,
      message: `Error: ${error.message || 'Unknown error occurred'}`
    };
  }
}

const activitymapCommand = {
  data: new SlashCommandBuilder()
    .setName('activitymap')
    .setDescription('Visualize faction member activity patterns')
    .addStringOption(option => 
      option.setName('view')
        .setDescription('The type of view to display')
        .setRequired(false)
        .addChoices(
          { name: 'Weekly Overview', value: 'weekly' },
          { name: 'Daily Breakdown', value: 'daily' },
          { name: 'Member Ranking', value: 'members' }
        ))
    .addIntegerOption(option =>
      option.setName('day')
        .setDescription('Day to view (0=Sunday, 1=Monday, etc.)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(6))
    .addBooleanOption(option =>
      option.setName('refresh')
        .setDescription('Force refresh the data from the API')
        .setRequired(false)),
    
  /**
   * Execute command with safe error handling
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    const result = await safeExecute(async () => {
      // Defer reply as this might take a bit
      await interaction.deferReply();
      
      // Get API key
      const apiKey = getUserApiKey(interaction.user.id);
      if (!apiKey) {
        return {
          error: true,
          message: 'You need to set your API key first using `/apikey`'
        };
      }
      
      // Get command options
      const view = interaction.options.getString('view') || 'weekly';
      const day = interaction.options.getInteger('day');
      const refresh = interaction.options.getBoolean('refresh') || false;
      
      // Get faction data and name
      let factionName = 'Your Faction';
      let factionId = null;
      
      try {
        // Get faction data
        if (refresh) {
          // Force update data from API
          await activityHeatmap.updateActivityData(apiKey, factionId);
        }
        
        // Generate heat map
        const heatMap = activityHeatmap.generateHeatMap(view, day);
        
        // Create embed
        const embed = activityHeatmap.generateHeatMapEmbed(heatMap, factionName);
        
        // Create components
        const components = activityHeatmap.generateHeatMapComponents(view, day);
        
        return { embed, components };
      } catch (error) {
        return {
          error: true,
          message: `Error fetching faction data: ${error.message}`
        };
      }
    });
    
    if (result.error) {
      await interaction.editReply({ content: result.message });
      return;
    }
    
    await interaction.editReply({
      embeds: [result.embed],
      components: result.components
    });
  },
  
  /**
   * Handle select menu interactions
   * @param {SelectMenuInteraction} interaction - Discord select menu interaction
   * @param {Client} client - Discord client
   */
  async handleSelectMenu(interaction, client) {
    const result = await safeExecute(async () => {
      // Get the selected value
      const customId = interaction.customId;
      const value = interaction.values[0];
      
      // Extract view and day from message components
      let view = 'weekly';
      let day = null;
      
      if (customId === 'heatmap_view') {
        view = value;
        
        // If there's a day selection component, get its value
        const daySelect = interaction.message.components.find(row => 
          row.components.some(component => component.customId === 'heatmap_day')
        );
        
        if (daySelect) {
          const dayComponent = daySelect.components.find(c => c.customId === 'heatmap_day');
          if (dayComponent) {
            day = parseInt(dayComponent.options.find(o => o.default)?.value || '0');
          }
        }
      } else if (customId === 'heatmap_day') {
        day = parseInt(value);
        view = 'daily';
      }
      
      // Get API key
      const apiKey = getUserApiKey(interaction.user.id);
      if (!apiKey) {
        return {
          error: true,
          message: 'You need to set your API key first using `/apikey`'
        };
      }
      
      // Generate heat map
      const heatMap = activityHeatmap.generateHeatMap(view, day);
      heatMap.day = day;
      
      // Create embed
      const embed = activityHeatmap.generateHeatMapEmbed(heatMap, 'Your Faction');
      
      // Create components
      const components = activityHeatmap.generateHeatMapComponents(view, day);
      
      return { embed, components };
    });
    
    if (result.error) {
      await interaction.update({ content: result.message, embeds: [], components: [] });
      return;
    }
    
    await interaction.update({
      embeds: [result.embed],
      components: result.components
    });
  },
  
  /**
   * Handle button interactions
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    const result = await safeExecute(async () => {
      if (interaction.customId !== 'heatmap_refresh') {
        return null;
      }
      
      // Get API key
      const apiKey = getUserApiKey(interaction.user.id);
      if (!apiKey) {
        return {
          error: true,
          message: 'You need to set your API key first using `/apikey`'
        };
      }
      
      // Extract view and day from message components
      let view = 'weekly';
      let day = null;
      
      // If there's a view selection component, get its value
      const viewSelect = interaction.message.components.find(row => 
        row.components.some(component => component.customId === 'heatmap_view')
      );
      
      if (viewSelect) {
        const viewComponent = viewSelect.components.find(c => c.customId === 'heatmap_view');
        if (viewComponent) {
          const selectedOption = viewComponent.options.find(o => o.default);
          if (selectedOption) {
            view = selectedOption.value;
          }
        }
      }
      
      // If there's a day selection component, get its value
      if (view === 'daily') {
        const daySelect = interaction.message.components.find(row => 
          row.components.some(component => component.customId === 'heatmap_day')
        );
        
        if (daySelect) {
          const dayComponent = daySelect.components.find(c => c.customId === 'heatmap_day');
          if (dayComponent) {
            const selectedDay = dayComponent.options.find(o => o.default);
            if (selectedDay) {
              day = parseInt(selectedDay.value);
            }
          }
        }
      }
      
      // Show loading state
      await interaction.deferUpdate();
      
      // Force update data from API
      await activityHeatmap.updateActivityData(apiKey);
      
      // Generate heat map
      const heatMap = activityHeatmap.generateHeatMap(view, day);
      heatMap.day = day;
      
      // Create embed
      const embed = activityHeatmap.generateHeatMapEmbed(heatMap, 'Your Faction');
      
      // Create components
      const components = activityHeatmap.generateHeatMapComponents(view, day);
      
      return { embed, components };
    });
    
    if (result === null) {
      return;
    }
    
    if (result.error) {
      await interaction.editReply({ content: result.message, embeds: [], components: [] });
      return;
    }
    
    await interaction.editReply({
      embeds: [result.embed],
      components: result.components
    });
  }
};

module.exports = { activitymapCommand };
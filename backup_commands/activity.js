const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatDate } = require('../utils/formatting');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const https = require('https');

// Activity command - shows recent faction activity
const activityCommand = {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('View recent faction activity')
    .addIntegerOption(option => 
      option
        .setName('limit')
        .setDescription('Number of activity entries to show (default: 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(25)),
  
  async execute(interaction, client) {
    // Defer reply to give time to process
    await interaction.deferReply();
    
    const limit = interaction.options.getInteger('limit') || 10;
    
    try {
      const activityData = await fetchFactionActivity();
      
      if (!activityData || activityData.error) {
        return interaction.editReply({
          content: `❌ Error fetching faction activity: ${activityData?.error || 'Unknown error'}`,
          ephemeral: true
        });
      }
      
      // Create rich embed for activity data
      const embed = new EmbedBuilder()
        .setTitle('🦉 BrotherOwlManager Faction Activity')
        .setColor(BOT_CONFIG.color)
        .setTimestamp();
      
      // Count total activities
      const totalActivities = Object.keys(activityData).length;
      embed.setDescription(`Showing ${Math.min(limit, totalActivities)} of ${totalActivities} recent activities`);
      
      // Sort activities by timestamp (newest first)
      const sortedActivities = Object.values(activityData)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
      
      if (sortedActivities.length === 0) {
        embed.addFields({ name: 'No Activity', value: 'No recent faction activity found.' });
      } else {
        const activityList = sortedActivities.map(activity => {
          const time = formatDate(new Date(activity.timestamp * 1000));
          return `**[${time}]** ${activity.event}`;
        }).join('\n\n');
        
        embed.addFields({ name: 'Recent Activity', value: activityList });
      }
      
      embed.setFooter({ 
        text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Data updated ${formatDate(new Date())}`
      });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logError('Error executing activity command:', error);
      await interaction.editReply({
        content: '❌ There was an error fetching faction activity data.',
        ephemeral: true
      });
    }
  }
};

/**
 * Fetch faction activity data from Torn API
 * @returns {Promise<Object>} Faction activity data
 */
async function fetchFactionActivity() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.torn.com',
      path: `/faction/?selections=basic,territory,log&key=${process.env.TORN_API_KEY}`,
      method: 'GET'
    };
    
    const req = https.request(options, res => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          
          // Extract and format activity data
          if (parsedData.log) {
            resolve(parsedData.log);
          } else if (parsedData.error) {
            resolve({ error: parsedData.error });
          } else {
            resolve({});
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', error => {
      reject(error);
    });
    
    req.end();
  });
}

module.exports = { activityCommand };
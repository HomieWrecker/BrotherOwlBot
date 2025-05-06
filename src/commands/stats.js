const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatNumber, formatDate } = require('../utils/formatting');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const https = require('https');

// Stats command - provides faction statistics
const statsCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Get faction statistics'),
  
  async execute(interaction, client) {
    // Defer reply to give time to process
    await interaction.deferReply();
    
    try {
      const statsData = await fetchFactionStats();
      
      if (!statsData || statsData.error) {
        return interaction.editReply({
          content: `❌ Error fetching faction stats: ${statsData?.error || 'Unknown error'}`,
          ephemeral: true
        });
      }
      
      // Create rich embed for stats data
      const embed = new EmbedBuilder()
        .setTitle(`🦉 ${BOT_CONFIG.name} Faction Statistics`)
        .setColor(BOT_CONFIG.color)
        .setTimestamp();
      
      // Add basic faction info
      if (statsData.name) {
        embed.setDescription(`**${statsData.name}** [${statsData.ID}]`);
      }
      
      // Add respect, age and territory counts
      const generalStats = [];
      
      if (statsData.respect !== undefined) {
        generalStats.push(`**Respect:** ${formatNumber(statsData.respect)}`);
      }
      
      if (statsData.age !== undefined) {
        const days = Math.floor(statsData.age / 86400);
        generalStats.push(`**Age:** ${formatNumber(days)} days`);
      }
      
      if (statsData.territory_wars !== undefined) {
        generalStats.push(`**Territory Wars:** ${formatNumber(statsData.territory_wars)}`);
      }
      
      if (statsData.territories !== undefined) {
        const territoryCount = Object.keys(statsData.territories).length;
        generalStats.push(`**Territories:** ${territoryCount}`);
      }
      
      if (generalStats.length > 0) {
        embed.addFields({ name: 'General Stats', value: generalStats.join(' | ') });
      }
      
      // Add membership stats
      const memberCount = statsData.members ? Object.keys(statsData.members).length : 0;
      const capacityInfo = statsData.capacity ? `${memberCount}/${statsData.capacity}` : memberCount;
      
      embed.addFields({ 
        name: 'Membership',
        value: `**Members:** ${capacityInfo}`
      });
      
      // Add attack stats if available
      if (statsData.best_chain !== undefined) {
        const attackStats = [];
        attackStats.push(`**Best Chain:** ${formatNumber(statsData.best_chain)}`);
        
        if (statsData.chain && statsData.chain.current) {
          attackStats.push(`**Current Chain:** ${formatNumber(statsData.chain.current)}`);
        }
        
        embed.addFields({ name: 'Attack Stats', value: attackStats.join(' | ') });
      }
      
      // Add peace status if available
      if (statsData.peace && Object.keys(statsData.peace).length > 0) {
        const peaceStatus = Object.entries(statsData.peace)
          .map(([factionID, expiry]) => {
            const expiryDate = new Date(expiry * 1000);
            return `Faction ${factionID}: until ${formatDate(expiryDate)}`;
          })
          .join('\n');
        
        embed.addFields({ name: 'Peace Treaties', value: peaceStatus });
      }
      
      embed.setFooter({ 
        text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Data updated ${formatDate(new Date())}`
      });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logError('Error executing stats command:', error);
      await interaction.editReply({
        content: '❌ There was an error fetching faction statistics.',
        ephemeral: true
      });
    }
  }
};

/**
 * Fetch faction statistics from Torn API
 * @returns {Promise<Object>} Faction statistics data
 */
async function fetchFactionStats() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.torn.com',
      path: `/faction/?selections=basic,stats,territory&key=${process.env.TORN_API_KEY}`,
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
          
          if (parsedData.error) {
            resolve({ error: parsedData.error });
          } else {
            resolve(parsedData);
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

module.exports = { statsCommand };
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatNumber, formatDate } = require('../utils/formatting');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');
const https = require('https');

// Members command - provides information about the faction's members
const membersCommand = {
  data: new SlashCommandBuilder()
    .setName('members')
    .setDescription('Get information about the faction\'s members'),
  
  async execute(interaction, client) {
    // Defer reply to give time to process
    await interaction.deferReply();
    
    // Fetch faction members data directly (not available through WebSocket)
    try {
      const membersData = await fetchFactionMembers();
      
      if (!membersData || membersData.error) {
        return interaction.editReply({
          content: `❌ Error fetching faction members: ${membersData?.error || 'Unknown error'}`,
          ephemeral: true
        });
      }
      
      // Create rich embed for members data
      const embed = new EmbedBuilder()
        .setTitle('🦉 BrotherOwlManager Faction Members')
        .setColor(BOT_CONFIG.color)
        .setTimestamp();
      
      // Count online/offline members
      const totalMembers = Object.keys(membersData).length;
      const onlineMembers = Object.values(membersData).filter(member => member.last_action.status === 'Online').length;
      
      embed.setDescription(`Total Members: **${totalMembers}** | Online: **${onlineMembers}**`);
      
      // Sort members by position
      const sortedMembers = Object.values(membersData).sort((a, b) => {
        // Sort by position first, then by name
        const positionOrder = { 'Leader': 1, 'Co-leader': 2, 'Officer': 3, 'Member': 4 };
        if (positionOrder[a.position] !== positionOrder[b.position]) {
          return positionOrder[a.position] - positionOrder[b.position];
        }
        return a.name.localeCompare(b.name);
      });
      
      // List leaders and officers (limited to keep embed size reasonable)
      const leadershipList = sortedMembers
        .filter(member => ['Leader', 'Co-leader', 'Officer'].includes(member.position))
        .map(member => {
          const status = member.last_action.status === 'Online' ? '🟢' : '⚪';
          return `${status} **${member.name}** (${member.position})`;
        })
        .join('\n');
      
      if (leadershipList) {
        embed.addFields({ name: 'Leadership', value: leadershipList });
      }
      
      // Show total member count by position
      const positionCounts = {};
      for (const member of Object.values(membersData)) {
        positionCounts[member.position] = (positionCounts[member.position] || 0) + 1;
      }
      
      const positionsList = Object.entries(positionCounts)
        .map(([position, count]) => `${position}s: ${count}`)
        .join(' | ');
      
      embed.addFields({ name: 'Position Summary', value: positionsList });
      
      embed.setFooter({ 
        text: `Faction data updated ${formatDate(new Date())}`
      });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logError('Error executing members command:', error);
      await interaction.editReply({
        content: '❌ There was an error fetching faction members data.',
        ephemeral: true
      });
    }
  }
};

/**
 * Fetch faction members data from Torn API
 * @returns {Promise<Object>} Faction members data
 */
async function fetchFactionMembers() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.torn.com',
      path: `/faction/?selections=basic&key=${process.env.TORN_API_KEY}`,
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
          resolve(parsedData.members || parsedData);
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

module.exports = { membersCommand };
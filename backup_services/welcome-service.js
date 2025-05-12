/**
 * Welcome service for Brother Owl
 * Handles new member welcomes, role assignment, and member departure notifications
 */

const fs = require('fs');
const path = require('path');
const { log, logError } = require('../utils/logger');
const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionsBitField 
} = require('discord.js');
const { BOT_CONFIG } = require('../config');

// Data storage
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const WELCOME_CONFIG_FILE = path.join(DATA_DIR, 'welcome_configs.json');

// Welcome messages for randomization
const WELCOME_MESSAGES = [
  // Torn-themed
  "Welcome to the faction, rookie! Remember, in Torn, it's always better to be the one holding the gun. 🔫",
  "Welcome to our Torn family! May your stats be high and your hospital visits be few. 🏥",
  "A new criminal has joined our ranks! Watch your back and your belongings. 😈",
  "Welcome to the crew! Remember, in Torn City, friends are temporary but enemies are permanent. Choose wisely! 🤝",
  "Fresh meat for the grinder! Welcome to Torn City's most notorious faction. 🥩",
  
  // Casual/humorous
  "Welcome aboard! We were going to throw a party but the cake is a lie. 🎂",
  "Welcome! Don't worry, we don't bite... much. 😬",
  "Look who decided to join the fun! Welcome to the madhouse! 🎭",
  "New member detected! Resistance is futile, you will be assimilated. 🤖",
  "Welcome! Please leave your sanity at the door, you won't be needing it here. 🧠",
  
  // Happy/friendly
  "We're thrilled to have you join our community! Welcome! 🎉",
  "A warm welcome to our newest member! We're glad you're here! 🌞",
  "Welcome to the family! We hope you'll feel right at home. 🏠",
  "The party can officially start now that you're here! Welcome! 🥳",
  "Welcome! Your presence makes our community even better! ✨"
];

// Role descriptions
const ROLE_DESCRIPTIONS = {
  "Member": "Full faction members with access to all faction resources and activities",
  "Ally": "Members of allied factions with limited access to shared resources",
  "Trader": "Business partners focused on market and item exchanges",
  "Guest": "Visitors with restricted access to general channels only"
};

// Make sure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize welcome configs
let welcomeConfigs = {};
try {
  if (fs.existsSync(WELCOME_CONFIG_FILE)) {
    welcomeConfigs = JSON.parse(fs.readFileSync(WELCOME_CONFIG_FILE, 'utf8'));
  } else {
    fs.writeFileSync(WELCOME_CONFIG_FILE, JSON.stringify(welcomeConfigs), 'utf8');
  }
} catch (error) {
  logError('Error initializing welcome configs:', error);
}

/**
 * Save welcome configs to file
 * @returns {boolean} Success state
 */
function saveWelcomeConfigs() {
  try {
    fs.writeFileSync(WELCOME_CONFIG_FILE, JSON.stringify(welcomeConfigs, null, 2), 'utf8');
    return true;
  } catch (error) {
    logError('Error saving welcome configs:', error);
    return false;
  }
}

/**
 * Get server welcome configuration
 * @param {string} serverId - Discord server ID
 * @returns {Object|null} Welcome config or null if not set
 */
function getWelcomeConfig(serverId) {
  return welcomeConfigs[serverId] || null;
}

/**
 * Set server welcome configuration
 * @param {string} serverId - Discord server ID
 * @param {Object} config - Welcome configuration
 * @returns {boolean} Success state
 */
function setWelcomeConfig(serverId, config) {
  try {
    welcomeConfigs[serverId] = {
      ...welcomeConfigs[serverId],
      ...config
    };
    
    saveWelcomeConfigs();
    log(`Updated welcome config for server ${serverId}`);
    return true;
  } catch (error) {
    logError(`Error setting welcome config for ${serverId}:`, error);
    return false;
  }
}

/**
 * Check if welcome system is configured for a server
 * @param {string} serverId - Discord server ID
 * @returns {boolean} Whether welcome system is configured
 */
function isWelcomeConfigured(serverId) {
  const config = getWelcomeConfig(serverId);
  if (!config) return false;
  
  // Check minimum required configuration
  return !!(config.welcomeChannelId && config.logChannelId);
}

/**
 * Handle new member join
 * @param {GuildMember} member - New guild member
 */
async function handleMemberJoin(member) {
  try {
    const serverId = member.guild.id;
    const config = getWelcomeConfig(serverId);
    
    // Skip if welcome is not configured
    if (!isWelcomeConfigured(serverId)) {
      log(`Welcome not configured for server ${serverId}, skipping welcome for new member ${member.user.tag}`);
      return;
    }
    
    // Get welcome channel
    const welcomeChannel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (!welcomeChannel) {
      logError(`Welcome channel not found for server ${serverId}`);
      return;
    }
    
    // Get random welcome message
    const welcomeMessage = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
    
    // Create welcome embed
    const embed = new EmbedBuilder()
      .setTitle(`Welcome to ${member.guild.name}!`)
      .setDescription(`<@${member.id}>, ${welcomeMessage}`)
      .setColor(BOT_CONFIG.color)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Member', value: `${member.user.tag}`, inline: true },
        { name: 'Joined', value: new Date().toLocaleString(), inline: true }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Select a role below` })
      .setTimestamp();
    
    // Create role selection buttons
    const roleRow = new ActionRowBuilder();
    
    // Add role buttons
    const roleTypes = ['Member', 'Contractor', 'Ally', 'Trader', 'Guest'];
    
    // Style guide: Primary for Member, Secondary for others
    roleRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`welcome_role_Member_${member.id}`)
        .setLabel('Member')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`welcome_role_Contractor_${member.id}`)
        .setLabel('Contractor')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`welcome_role_Ally_${member.id}`)
        .setLabel('Ally')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`welcome_role_Trader_${member.id}`)
        .setLabel('Trader')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`welcome_role_Guest_${member.id}`)
        .setLabel('Guest')
        .setStyle(ButtonStyle.Secondary)
    );
    
    // Send welcome message
    await welcomeChannel.send({
      content: `Welcome <@${member.id}>! Please select a role that best describes your relationship with our faction:`,
      embeds: [embed],
      components: [roleRow]
    });
    
    // Log new member join
    await logMemberEvent(member.guild, 'join', member.user);
  } catch (error) {
    logError(`Error handling member join for ${member.user.tag}:`, error);
  }
}

/**
 * Handle member leave
 * @param {GuildMember} member - Member who left
 */
async function handleMemberLeave(member) {
  try {
    await logMemberEvent(member.guild, 'leave', member.user);
  } catch (error) {
    logError(`Error handling member leave for ${member.user.tag}:`, error);
  }
}

/**
 * Handle role selection
 * @param {ButtonInteraction} interaction - Button interaction
 * @param {string} roleType - Role type
 * @param {string} userId - User ID
 */
async function handleRoleSelection(interaction, roleType, userId) {
  try {
    const serverId = interaction.guildId;
    const config = getWelcomeConfig(serverId);
    
    // Verify the user ID matches the button presser (prevent others from clicking)
    if (interaction.user.id !== userId) {
      return interaction.reply({
        content: '❌ This button is not meant for you.',
        ephemeral: true
      });
    }
    
    // If Member role was selected, send verification request
    if (roleType === 'Member') {
      // Get verification channel
      const verificationChannel = await interaction.guild.channels.fetch(config.verificationChannelId).catch(() => null);
      if (!verificationChannel) {
        return interaction.reply({
          content: '❌ Verification channel not configured. Please contact an administrator.',
          ephemeral: true
        });
      }
      
      // Create verification embed
      const verifyEmbed = new EmbedBuilder()
        .setTitle('Member Verification Request')
        .setDescription(`<@${userId}> has requested to join as a full member.`)
        .setColor(BOT_CONFIG.color)
        .addFields(
          { name: 'User', value: `<@${userId}>`, inline: true },
          { name: 'Requested Role', value: roleType, inline: true },
          { name: 'Requested At', value: new Date().toLocaleString(), inline: false }
        )
        .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Awaiting verification` })
        .setTimestamp();
      
      // Create verification buttons
      const verifyRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`welcome_verify_accept_${userId}`)
            .setLabel('Accept')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`welcome_verify_deny_${userId}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
        );
      
      // Send verification request
      await verificationChannel.send({
        content: config.approverRoleId ? `<@&${config.approverRoleId}> Verification needed:` : 'Verification needed:',
        embeds: [verifyEmbed],
        components: [verifyRow]
      });
      
      // Reply to the user
      await interaction.reply({
        content: `✅ Your member verification request has been submitted and is awaiting approval. You'll be notified when a decision is made.`,
        ephemeral: true
      });
    } else {
      // For other roles, assign directly
      // Find the role
      const roleName = config[`${roleType.toLowerCase()}RoleId`] ? null : roleType;
      const roleId = config[`${roleType.toLowerCase()}RoleId`] || null;
      
      let role;
      if (roleId) {
        role = await interaction.guild.roles.fetch(roleId).catch(() => null);
      } else if (roleName) {
        role = interaction.guild.roles.cache.find(r => r.name === roleName);
      }
      
      if (!role) {
        return interaction.reply({
          content: `❌ ${roleType} role not found. Please contact an administrator.`,
          ephemeral: true
        });
      }
      
      // Assign the role
      const member = await interaction.guild.members.fetch(userId);
      await member.roles.add(role);
      
      // Reply to the user
      await interaction.reply({
        content: `✅ You have been assigned the ${roleType} role.\n\n**Role Description:** ${ROLE_DESCRIPTIONS[roleType] || 'No description available.'}`,
        ephemeral: true
      });
      
      // Log role assignment
      await logMemberEvent(interaction.guild, 'role_assign', interaction.user, roleType);
    }
  } catch (error) {
    logError(`Error handling role selection for ${userId}:`, error);
    
    await interaction.reply({
      content: '❌ An error occurred while assigning your role. Please try again or contact an administrator.',
      ephemeral: true
    });
  }
}

/**
 * Handle verification response
 * @param {ButtonInteraction} interaction - Button interaction
 * @param {string} action - Verify action (accept/deny)
 * @param {string} userId - User ID
 */
async function handleVerification(interaction, action, userId) {
  try {
    const serverId = interaction.guildId;
    const config = getWelcomeConfig(serverId);
    
    // Check if the interaction user has permission
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasPermission = 
      member.permissions.has(PermissionsBitField.Flags.Administrator) || 
      (config.approverRoleId && member.roles.cache.has(config.approverRoleId));
    
    if (!hasPermission) {
      return interaction.reply({
        content: '❌ You do not have permission to verify members.',
        ephemeral: true
      });
    }
    
    // Get the user to verify
    const userToVerify = await interaction.guild.members.fetch(userId).catch(() => null);
    
    if (!userToVerify) {
      return interaction.update({
        content: '❌ User not found. They may have left the server.',
        components: [],
        embeds: interaction.message.embeds
      });
    }
    
    if (action === 'accept') {
      // Get member role
      const roleId = config.memberRoleId;
      const role = roleId ? 
        await interaction.guild.roles.fetch(roleId).catch(() => null) : 
        interaction.guild.roles.cache.find(r => r.name === 'Member');
      
      if (!role) {
        return interaction.update({
          content: '❌ Member role not found. Please configure the member role first.',
          components: [],
          embeds: interaction.message.embeds
        });
      }
      
      // Assign the role
      await userToVerify.roles.add(role);
      
      // Update verification message
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#00FF00')
        .setTitle('Member Verification Accepted')
        .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Verification accepted by ${interaction.user.tag}` });
      
      await interaction.update({
        content: `✅ <@${userId}> has been verified and granted the Member role by <@${interaction.user.id}>.`,
        embeds: [updatedEmbed],
        components: []
      });
      
      // Notify the user
      try {
        await userToVerify.send({
          content: `✅ Your member verification request in **${interaction.guild.name}** has been accepted! You've been granted the Member role.`
        });
      } catch (dmError) {
        log(`Could not DM user ${userId} about verification acceptance: ${dmError.message}`);
      }
      
      // Log verification
      await logMemberEvent(interaction.guild, 'verify_accept', userToVerify.user, 'Member', interaction.user);
    } else {
      // Update verification message
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#FF0000')
        .setTitle('Member Verification Denied')
        .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | Verification denied by ${interaction.user.tag}` });
      
      await interaction.update({
        content: `❌ <@${userId}>'s verification request has been denied by <@${interaction.user.id}>.`,
        embeds: [updatedEmbed],
        components: []
      });
      
      // Notify the user
      try {
        await userToVerify.send({
          content: `❌ Your member verification request in **${interaction.guild.name}** has been denied. Please contact a server administrator for more information.`
        });
      } catch (dmError) {
        log(`Could not DM user ${userId} about verification denial: ${dmError.message}`);
      }
      
      // Log verification
      await logMemberEvent(interaction.guild, 'verify_deny', userToVerify.user, null, interaction.user);
    }
  } catch (error) {
    logError(`Error handling verification for ${userId}:`, error);
    
    await interaction.reply({
      content: '❌ An error occurred while processing verification. Please try again.',
      ephemeral: true
    });
  }
}

/**
 * Log member events to the configured log channel
 * @param {Guild} guild - Discord guild
 * @param {string} eventType - Event type (join, leave, role_assign, verify_accept, verify_deny)
 * @param {User} user - Discord user
 * @param {string} [role] - Role name (for role events)
 * @param {User} [actorUser] - User who performed the action (for verification events)
 */
async function logMemberEvent(guild, eventType, user, role = null, actorUser = null) {
  try {
    const serverId = guild.id;
    const config = getWelcomeConfig(serverId);
    
    // Skip if logging is not configured
    if (!config || !config.logChannelId) {
      return;
    }
    
    // Get log channel
    const logChannel = await guild.channels.fetch(config.logChannelId).catch(() => null);
    if (!logChannel) {
      return;
    }
    
    // Create log embed based on event type
    const embed = new EmbedBuilder()
      .setColor(getEventColor(eventType))
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version} | User ID: ${user.id}` })
      .setTimestamp();
    
    switch (eventType) {
      case 'join':
        embed.setTitle('📥 Member Joined')
          .setDescription(`<@${user.id}> (${user.tag}) has joined the server.`)
          .addFields(
            { name: 'Account Created', value: user.createdAt.toLocaleString(), inline: true }
          );
        break;
        
      case 'leave':
        embed.setTitle('📤 Member Left')
          .setDescription(`**${user.tag}** has left the server.`);
        break;
        
      case 'role_assign':
        embed.setTitle('🏷️ Role Assigned')
          .setDescription(`<@${user.id}> has been assigned the **${role}** role.`);
        break;
        
      case 'verify_accept':
        embed.setTitle('✅ Member Verified')
          .setDescription(`<@${user.id}> has been verified as a **${role}**.`)
          .addFields(
            { name: 'Verified By', value: actorUser ? `<@${actorUser.id}>` : 'Unknown', inline: true }
          );
        break;
        
      case 'verify_deny':
        embed.setTitle('❌ Verification Denied')
          .setDescription(`<@${user.id}>'s verification request has been denied.`)
          .addFields(
            { name: 'Denied By', value: actorUser ? `<@${actorUser.id}>` : 'Unknown', inline: true }
          );
        break;
    }
    
    // Send the log
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    logError(`Error logging member event (${eventType}) for ${user.tag}:`, error);
  }
}

/**
 * Get color for event type
 * @param {string} eventType - Event type
 * @returns {number} Color code
 */
function getEventColor(eventType) {
  switch (eventType) {
    case 'join':
      return 0x00FF00; // Green
    case 'leave':
      return 0xFF0000; // Red
    case 'role_assign':
      return 0x00FFFF; // Cyan
    case 'verify_accept':
      return 0x00FF00; // Green
    case 'verify_deny':
      return 0xFF0000; // Red
    default:
      return BOT_CONFIG.color;
  }
}

/**
 * Initialize welcome service
 * @param {Client} client - Discord client
 */
function initWelcomeService(client) {
  // Set up event listeners for member join/leave
  client.on('guildMemberAdd', handleMemberJoin);
  client.on('guildMemberRemove', handleMemberLeave);
  
  log('Welcome service initialized');
}

module.exports = {
  getWelcomeConfig,
  setWelcomeConfig,
  isWelcomeConfigured,
  handleRoleSelection,
  handleVerification,
  initWelcomeService,
  ROLE_DESCRIPTIONS
};
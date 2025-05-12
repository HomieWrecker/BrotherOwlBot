/**
 * Bot Permissions command for BrotherOwlManager
 * Manages role-based access control for bot commands and features
 */

const { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder, 
  Colors,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder
} = require('discord.js');
const { log, logError } = require('../utils/logger');
const { BOT_CONFIG } = require('../config');

// Command creation with proper error isolation
const botpermissionsCommand = {
  data: new SlashCommandBuilder()
    .setName('botpermissions')
    .setDescription('Configure role-based permissions for bot commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable or disable role-based permissions')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable or disable permissions')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set permissions for a role')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to set permissions for')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('category')
            .setDescription('Command category')
            .setRequired(true)
            .addChoices(
              { name: 'Administration', value: 'administration' },
              { name: 'Faction Info', value: 'faction_info' },
              { name: 'Bank', value: 'bank' },
              { name: 'Chain', value: 'chain' },
              { name: 'Stats', value: 'stats' },
              { name: 'War', value: 'war' },
              { name: 'Events', value: 'events' }
            ))
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('Permission level')
            .setRequired(true)
            .addChoices(
              { name: 'No Access', value: 0 },
              { name: 'Use', value: 1 },
              { name: 'Contribute', value: 2 },
              { name: 'Manage', value: 3 },
              { name: 'Admin', value: 4 }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current permissions')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to view permissions for')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset all permissions to default')),

  /**
   * Execute command with safe error handling
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Client} client - Discord client
   */
  async execute(interaction, client) {
    try {
      // Safely execute the command with proper error isolation
      return await safeExecuteCommand(interaction, client);
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error executing botpermissions command (protected):', error);
      
      // Handle errors in responding to the interaction
      const errorResponse = {
        content: '❌ There was an error with the bot permissions system. This error has been logged and will not affect other bot functionality.',
        ephemeral: true
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorResponse).catch(err => {
          logError('Error sending error followUp for botpermissions command:', err);
        });
      } else {
        await interaction.reply(errorResponse).catch(err => {
          logError('Error sending error reply for botpermissions command:', err);
        });
      }
    }
  },

  /**
   * Handle button interactions for permissions management
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @param {Client} client - Discord client
   */
  async handleButton(interaction, client) {
    try {
      if (interaction.customId.startsWith('permissions_')) {
        // Get the role permissions service
        const rolePermissions = require('../services/role-permissions');
        
        // Handle different button actions
        if (interaction.customId === 'permissions_view_all') {
          await handleViewAllPermissions(interaction, client, rolePermissions);
        } else if (interaction.customId === 'permissions_reset_confirm') {
          await handleResetConfirm(interaction, client, rolePermissions);
        } else if (interaction.customId === 'permissions_reset_cancel') {
          await interaction.update({
            content: 'Reset cancelled.',
            components: [],
            embeds: []
          });
        }
      }
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error handling permissions button (protected):', error);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ There was an error with the permissions system.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.followUp({
            content: '❌ There was an error with the permissions system.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending permissions button error reply:', replyError);
      }
    }
  },

  /**
   * Handle select menu interactions for permissions management
   * @param {StringSelectMenuInteraction} interaction - Discord select menu interaction
   * @param {Client} client - Discord client
   */
  async handleSelectMenu(interaction, client) {
    try {
      if (interaction.customId.startsWith('permissions_')) {
        // Get the role permissions service
        const rolePermissions = require('../services/role-permissions');
        
        // Handle different select menu actions
        if (interaction.customId === 'permissions_category_select') {
          await handleCategorySelect(interaction, client, rolePermissions);
        } else if (interaction.customId === 'permissions_role_select') {
          await handleRoleSelect(interaction, client, rolePermissions);
        }
      }
    } catch (error) {
      // Comprehensive error handling to prevent affecting core bot functionality
      logError('Error handling permissions select menu (protected):', error);
      
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ There was an error with the permissions system.',
            ephemeral: true
          });
        } else if (interaction.deferred) {
          await interaction.followUp({
            content: '❌ There was an error with the permissions system.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logError('Error sending permissions select menu error reply:', replyError);
      }
    }
  }
};

/**
 * Safely execute command with proper error isolation
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 */
async function safeExecuteCommand(interaction, client) {
  // Get the subcommand
  const subcommand = interaction.options.getSubcommand();
  
  // Get the role permissions service
  // We load this inside the function to prevent it from affecting the bot if it fails
  const rolePermissions = require('../services/role-permissions');
  
  switch (subcommand) {
    case 'enable':
      await handleEnable(interaction, client, rolePermissions);
      break;
      
    case 'set':
      await handleSet(interaction, client, rolePermissions);
      break;
      
    case 'view':
      await handleView(interaction, client, rolePermissions);
      break;
      
    case 'reset':
      await handleReset(interaction, client, rolePermissions);
      break;
      
    default:
      await interaction.reply({
        content: '❌ Unknown subcommand.',
        ephemeral: true
      });
  }
}

/**
 * Handle enable subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} rolePermissions - Role permissions service
 */
async function handleEnable(interaction, client, rolePermissions) {
  try {
    // Get options
    const enabled = interaction.options.getBoolean('enabled');
    
    // Set permissions enabled
    rolePermissions.setPermissionsEnabled(interaction.guildId, enabled);
    
    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('Bot Permissions System')
      .setColor(enabled ? Colors.Green : Colors.Red)
      .setDescription(`Role-based permissions system has been ${enabled ? 'enabled' : 'disabled'}.`)
      .addFields(
        { name: 'Status', value: enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Effect', value: enabled 
            ? 'Commands will now be restricted based on role permissions.' 
            : 'All commands are now available to everyone.', 
          inline: false }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    if (enabled) {
      embed.addFields({
        name: 'Next Steps',
        value: 'Use `/botpermissions set` to configure role permissions for specific command categories.',
        inline: false
      });
    }
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
    log(`Bot permissions system ${enabled ? 'enabled' : 'disabled'} for server ${interaction.guildId}`);
    
  } catch (error) {
    logError('Error in handleEnable for bot permissions:', error);
    throw error; // Let the outer error handler catch it
  }
}

/**
 * Handle set subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} rolePermissions - Role permissions service
 */
async function handleSet(interaction, client, rolePermissions) {
  try {
    // Get options
    const role = interaction.options.getRole('role');
    const category = interaction.options.getString('category');
    const level = interaction.options.getInteger('level');
    
    // Set role category permission
    rolePermissions.setRoleCategoryPermission(interaction.guildId, role.id, category, level);
    
    // Get permission level name
    const PERMISSION_LEVELS = rolePermissions.getPermissionLevels();
    const levelNames = {
      [PERMISSION_LEVELS.NONE]: 'No Access',
      [PERMISSION_LEVELS.USE]: 'Use',
      [PERMISSION_LEVELS.CONTRIBUTE]: 'Contribute',
      [PERMISSION_LEVELS.MANAGE]: 'Manage',
      [PERMISSION_LEVELS.ADMIN]: 'Admin'
    };
    
    // Get category name
    const categoryNames = {
      [rolePermissions.COMMAND_CATEGORIES.ADMINISTRATION]: 'Administration',
      [rolePermissions.COMMAND_CATEGORIES.FACTION_INFO]: 'Faction Info',
      [rolePermissions.COMMAND_CATEGORIES.BANK]: 'Bank',
      [rolePermissions.COMMAND_CATEGORIES.CHAIN]: 'Chain',
      [rolePermissions.COMMAND_CATEGORIES.STATS]: 'Stats',
      [rolePermissions.COMMAND_CATEGORIES.WAR]: 'War',
      [rolePermissions.COMMAND_CATEGORIES.EVENTS]: 'Events'
    };
    
    // Get commands in category
    const commands = rolePermissions.getCategoryCommands(category);
    
    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('Permission Updated')
      .setColor(level > 0 ? Colors.Green : Colors.Red)
      .setDescription(`Permissions for **${role.name}** have been updated.`)
      .addFields(
        { name: 'Role', value: `<@&${role.id}>`, inline: true },
        { name: 'Category', value: categoryNames[category] || category, inline: true },
        { name: 'Permission Level', value: levelNames[level] || `Level ${level}`, inline: true }
      )
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    if (commands.length > 0) {
      embed.addFields({
        name: 'Affected Commands',
        value: commands.map(cmd => `\`/${cmd}\``).join(', '),
        inline: false
      });
    }
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
    log(`Set permission for role ${role.id} in category ${category} to level ${level} on server ${interaction.guildId}`);
    
  } catch (error) {
    logError('Error in handleSet for bot permissions:', error);
    throw error; // Let the outer error handler catch it
  }
}

/**
 * Handle view subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} rolePermissions - Role permissions service
 */
async function handleView(interaction, client, rolePermissions) {
  try {
    // Get options
    const role = interaction.options.getRole('role');
    
    // Get server permissions
    const serverPermissions = rolePermissions.getServerPermissions(interaction.guildId);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Bot Permissions')
      .setColor(serverPermissions.enabled ? Colors.Blue : Colors.Grey)
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // Add system status
    embed.addFields({
      name: 'Permissions System',
      value: serverPermissions.enabled ? '✅ Enabled' : '❌ Disabled',
      inline: false
    });
    
    // If role specified, show role permissions
    if (role) {
      const rolePerms = rolePermissions.getRolePermissions(interaction.guildId, role.id);
      
      if (Object.keys(rolePerms).length === 0) {
        embed.setDescription(`No specific permissions set for role **${role.name}**.`);
      } else {
        embed.setDescription(`Permissions for role **${role.name}**:`);
        
        // Get permission level names
        const PERMISSION_LEVELS = rolePermissions.getPermissionLevels();
        const levelNames = {
          [PERMISSION_LEVELS.NONE]: 'No Access',
          [PERMISSION_LEVELS.USE]: 'Use',
          [PERMISSION_LEVELS.CONTRIBUTE]: 'Contribute',
          [PERMISSION_LEVELS.MANAGE]: 'Manage',
          [PERMISSION_LEVELS.ADMIN]: 'Admin'
        };
        
        // Get category names
        const categoryNames = {
          [rolePermissions.COMMAND_CATEGORIES.ADMINISTRATION]: 'Administration',
          [rolePermissions.COMMAND_CATEGORIES.FACTION_INFO]: 'Faction Info',
          [rolePermissions.COMMAND_CATEGORIES.BANK]: 'Bank',
          [rolePermissions.COMMAND_CATEGORIES.CHAIN]: 'Chain',
          [rolePermissions.COMMAND_CATEGORIES.STATS]: 'Stats',
          [rolePermissions.COMMAND_CATEGORIES.WAR]: 'War',
          [rolePermissions.COMMAND_CATEGORIES.EVENTS]: 'Events'
        };
        
        // Add fields for each category
        for (const [category, level] of Object.entries(rolePerms)) {
          const categoryName = categoryNames[category] || category;
          const levelName = levelNames[level] || `Level ${level}`;
          
          embed.addFields({
            name: categoryName,
            value: levelName,
            inline: true
          });
        }
      }
    } else {
      // Show system overview
      embed.setDescription(`Overview of the role-based permissions system.`);
      
      // Add categories
      const categories = rolePermissions.getCommandCategories();
      const categoryList = Object.values(categories)
        .map(category => {
          const commands = rolePermissions.getCategoryCommands(category);
          return `**${category}**: ${commands.map(cmd => `\`/${cmd}\``).join(', ')}`;
        })
        .join('\n\n');
      
      embed.addFields({
        name: 'Command Categories',
        value: categoryList,
        inline: false
      });
      
      // Add view all button
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('permissions_view_all')
            .setLabel('View All Role Permissions')
            .setStyle(ButtonStyle.Primary)
        );
      
      return interaction.reply({
        embeds: [embed],
        components: [actionRow],
        ephemeral: true
      });
    }
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in handleView for bot permissions:', error);
    throw error; // Let the outer error handler catch it
  }
}

/**
 * Handle reset subcommand
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Client} client - Discord client
 * @param {Object} rolePermissions - Role permissions service
 */
async function handleReset(interaction, client, rolePermissions) {
  try {
    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('Reset Permissions')
      .setColor(Colors.Red)
      .setDescription('Are you sure you want to reset all bot permissions?\n\nThis will remove all role permission settings and disable the permissions system.')
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // Create confirmation buttons
    const actionRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('permissions_reset_confirm')
          .setLabel('Reset Permissions')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('permissions_reset_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.reply({
      embeds: [embed],
      components: [actionRow],
      ephemeral: true
    });
    
  } catch (error) {
    logError('Error in handleReset for bot permissions:', error);
    throw error; // Let the outer error handler catch it
  }
}

/**
 * Handle view all permissions button
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 * @param {Object} rolePermissions - Role permissions service
 */
async function handleViewAllPermissions(interaction, client, rolePermissions) {
  try {
    await interaction.deferUpdate();
    
    // Get server permissions
    const serverPermissions = rolePermissions.getServerPermissions(interaction.guildId);
    
    // Get all roles in the server
    const roles = await interaction.guild.roles.fetch();
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('All Role Permissions')
      .setColor(serverPermissions.enabled ? Colors.Blue : Colors.Grey)
      .setDescription(`Permission settings for all roles in the server.`)
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // Add system status
    embed.addFields({
      name: 'Permissions System',
      value: serverPermissions.enabled ? '✅ Enabled' : '❌ Disabled',
      inline: false
    });
    
    // Get permission level names
    const PERMISSION_LEVELS = rolePermissions.getPermissionLevels();
    const levelNames = {
      [PERMISSION_LEVELS.NONE]: 'No Access',
      [PERMISSION_LEVELS.USE]: 'Use',
      [PERMISSION_LEVELS.CONTRIBUTE]: 'Contribute',
      [PERMISSION_LEVELS.MANAGE]: 'Manage',
      [PERMISSION_LEVELS.ADMIN]: 'Admin'
    };
    
    // Get all roles with permissions
    const roleIds = Object.keys(serverPermissions.roles || {});
    
    if (roleIds.length === 0) {
      embed.addFields({
        name: 'No Role Permissions',
        value: 'No specific role permissions have been set.',
        inline: false
      });
    } else {
      // Add fields for each role with permissions
      for (const roleId of roleIds) {
        const role = roles.get(roleId);
        
        if (!role) continue; // Skip if role doesn't exist
        
        const rolePerms = serverPermissions.roles[roleId];
        
        if (Object.keys(rolePerms).length === 0) continue; // Skip if no permissions
        
        let permText = '';
        
        for (const [category, level] of Object.entries(rolePerms)) {
          const levelName = levelNames[level] || `Level ${level}`;
          permText += `${category}: **${levelName}**\n`;
        }
        
        embed.addFields({
          name: role.name,
          value: permText,
          inline: true
        });
      }
    }
    
    // Create select menu for categories
    const categories = rolePermissions.getCommandCategories();
    
    // Create select menus for viewing specific permissions
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId('permissions_category_select')
      .setPlaceholder('Select a category to view...')
      .addOptions(
        Object.entries(categories).map(([name, value]) => 
          new StringSelectMenuOptionBuilder()
            .setLabel(name.charAt(0) + name.slice(1).toLowerCase())
            .setValue(value)
        )
      );
    
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('permissions_role_select')
      .setPlaceholder('Select a role to view...');
    
    const row1 = new ActionRowBuilder().addComponents(categorySelect);
    const row2 = new ActionRowBuilder().addComponents(roleSelect);
    
    await interaction.editReply({
      embeds: [embed],
      components: [row1, row2]
    });
    
  } catch (error) {
    logError('Error in handleViewAllPermissions for bot permissions:', error);
    await interaction.followUp({
      content: '❌ Error viewing all permissions.',
      ephemeral: true
    });
  }
}

/**
 * Handle category select menu
 * @param {StringSelectMenuInteraction} interaction - Discord select menu interaction
 * @param {Client} client - Discord client
 * @param {Object} rolePermissions - Role permissions service
 */
async function handleCategorySelect(interaction, client, rolePermissions) {
  try {
    await interaction.deferUpdate();
    
    // Get selected category
    const category = interaction.values[0];
    
    // Get server permissions
    const serverPermissions = rolePermissions.getServerPermissions(interaction.guildId);
    
    // Get all roles in the server
    const roles = await interaction.guild.roles.fetch();
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle(`${category.charAt(0).toUpperCase() + category.slice(1)} Permissions`)
      .setColor(Colors.Blue)
      .setDescription(`Permissions for the ${category} category.`)
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    // Get commands in category
    const commands = rolePermissions.getCategoryCommands(category);
    
    if (commands.length > 0) {
      embed.addFields({
        name: 'Commands',
        value: commands.map(cmd => `\`/${cmd}\``).join(', '),
        inline: false
      });
    }
    
    // Get permission level names
    const PERMISSION_LEVELS = rolePermissions.getPermissionLevels();
    const levelNames = {
      [PERMISSION_LEVELS.NONE]: 'No Access',
      [PERMISSION_LEVELS.USE]: 'Use',
      [PERMISSION_LEVELS.CONTRIBUTE]: 'Contribute',
      [PERMISSION_LEVELS.MANAGE]: 'Manage',
      [PERMISSION_LEVELS.ADMIN]: 'Admin'
    };
    
    // Get all roles with permissions for this category
    const rolePermsList = [];
    
    if (serverPermissions.categories && serverPermissions.categories[category]) {
      for (const [roleId, level] of Object.entries(serverPermissions.categories[category])) {
        const role = roles.get(roleId);
        
        if (!role) continue; // Skip if role doesn't exist
        
        rolePermsList.push({
          name: role.name,
          level: level,
          levelName: levelNames[level] || `Level ${level}`
        });
      }
    }
    
    if (rolePermsList.length === 0) {
      embed.addFields({
        name: 'No Role Permissions',
        value: 'No specific role permissions have been set for this category.',
        inline: false
      });
    } else {
      // Sort by level (highest first)
      rolePermsList.sort((a, b) => b.level - a.level);
      
      // Add fields for each role
      const permText = rolePermsList
        .map(rp => `<@&${roles.find(r => r.name === rp.name).id}>: **${rp.levelName}**`)
        .join('\n');
      
      embed.addFields({
        name: 'Role Permissions',
        value: permText,
        inline: false
      });
    }
    
    // Keep the select menus
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId('permissions_category_select')
      .setPlaceholder('Select a category to view...')
      .addOptions(
        Object.entries(rolePermissions.getCommandCategories()).map(([name, value]) => 
          new StringSelectMenuOptionBuilder()
            .setLabel(name.charAt(0) + name.slice(1).toLowerCase())
            .setValue(value)
            .setDefault(value === category)
        )
      );
    
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('permissions_role_select')
      .setPlaceholder('Select a role to view...');
    
    const row1 = new ActionRowBuilder().addComponents(categorySelect);
    const row2 = new ActionRowBuilder().addComponents(roleSelect);
    
    await interaction.editReply({
      embeds: [embed],
      components: [row1, row2]
    });
    
  } catch (error) {
    logError('Error in handleCategorySelect for bot permissions:', error);
    await interaction.followUp({
      content: '❌ Error viewing category permissions.',
      ephemeral: true
    });
  }
}

/**
 * Handle role select menu
 * @param {RoleSelectMenuInteraction} interaction - Discord role select menu interaction
 * @param {Client} client - Discord client
 * @param {Object} rolePermissions - Role permissions service
 */
async function handleRoleSelect(interaction, client, rolePermissions) {
  try {
    await interaction.deferUpdate();
    
    // Get selected role
    const roleId = interaction.values[0];
    const role = await interaction.guild.roles.fetch(roleId);
    
    // Get role permissions
    const rolePerms = rolePermissions.getRolePermissions(interaction.guildId, roleId);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle(`Role Permissions: ${role.name}`)
      .setColor(role.color || Colors.Blue)
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    if (Object.keys(rolePerms).length === 0) {
      embed.setDescription(`No specific permissions set for role **${role.name}**.`);
    } else {
      embed.setDescription(`Permissions for role **${role.name}**:`);
      
      // Get permission level names
      const PERMISSION_LEVELS = rolePermissions.getPermissionLevels();
      const levelNames = {
        [PERMISSION_LEVELS.NONE]: 'No Access',
        [PERMISSION_LEVELS.USE]: 'Use',
        [PERMISSION_LEVELS.CONTRIBUTE]: 'Contribute',
        [PERMISSION_LEVELS.MANAGE]: 'Manage',
        [PERMISSION_LEVELS.ADMIN]: 'Admin'
      };
      
      // Get category names
      const categoryNames = {
        [rolePermissions.COMMAND_CATEGORIES.ADMINISTRATION]: 'Administration',
        [rolePermissions.COMMAND_CATEGORIES.FACTION_INFO]: 'Faction Info',
        [rolePermissions.COMMAND_CATEGORIES.BANK]: 'Bank',
        [rolePermissions.COMMAND_CATEGORIES.CHAIN]: 'Chain',
        [rolePermissions.COMMAND_CATEGORIES.STATS]: 'Stats',
        [rolePermissions.COMMAND_CATEGORIES.WAR]: 'War',
        [rolePermissions.COMMAND_CATEGORIES.EVENTS]: 'Events'
      };
      
      // Add fields for each category
      for (const [category, level] of Object.entries(rolePerms)) {
        const categoryName = categoryNames[category] || category;
        const levelName = levelNames[level] || `Level ${level}`;
        
        // Get commands in category
        const commands = rolePermissions.getCategoryCommands(category);
        const commandText = commands.length > 0 
          ? `Commands: ${commands.map(cmd => `\`/${cmd}\``).join(', ')}`
          : '';
        
        embed.addFields({
          name: `${categoryName}: ${levelName}`,
          value: commandText || 'No commands in this category',
          inline: false
        });
      }
    }
    
    // Keep the select menus
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId('permissions_category_select')
      .setPlaceholder('Select a category to view...')
      .addOptions(
        Object.entries(rolePermissions.getCommandCategories()).map(([name, value]) => 
          new StringSelectMenuOptionBuilder()
            .setLabel(name.charAt(0) + name.slice(1).toLowerCase())
            .setValue(value)
        )
      );
    
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('permissions_role_select')
      .setPlaceholder('Select a role to view...');
    
    const row1 = new ActionRowBuilder().addComponents(categorySelect);
    const row2 = new ActionRowBuilder().addComponents(roleSelect);
    
    await interaction.editReply({
      embeds: [embed],
      components: [row1, row2]
    });
    
  } catch (error) {
    logError('Error in handleRoleSelect for bot permissions:', error);
    await interaction.followUp({
      content: '❌ Error viewing role permissions.',
      ephemeral: true
    });
  }
}

/**
 * Handle reset confirm button
 * @param {ButtonInteraction} interaction - Discord button interaction
 * @param {Client} client - Discord client
 * @param {Object} rolePermissions - Role permissions service
 */
async function handleResetConfirm(interaction, client, rolePermissions) {
  try {
    // Reset server permissions
    rolePermissions.resetServerPermissions(interaction.guildId);
    
    // Create confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('Permissions Reset')
      .setColor(Colors.Green)
      .setDescription('All bot permissions have been reset to default.\n\nThe permissions system has been disabled and all role permissions have been cleared.')
      .setFooter({ text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}` })
      .setTimestamp();
    
    await interaction.update({
      embeds: [embed],
      components: []
    });
    
    log(`Reset permissions for server ${interaction.guildId}`);
    
  } catch (error) {
    logError('Error in handleResetConfirm for bot permissions:', error);
    await interaction.followUp({
      content: '❌ Error resetting permissions.',
      ephemeral: true
    });
  }
}

module.exports = { botpermissionsCommand };
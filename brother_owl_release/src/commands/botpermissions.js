/**
 * Bot Permissions command for Brother Owl
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
const { log, error } = require('../utils/logger');

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
              { name: 'Welcome', value: 'welcome' },
              { name: 'Faction Info', value: 'faction_info' },
              { name: 'Stats', value: 'stats' },
              { name: 'API Keys', value: 'api_keys' }
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
      console.error('Error executing botpermissions command (protected):', error);
      
      // Handle errors in responding to the interaction
      const errorResponse = {
        content: '❌ There was an error with the bot permissions system. This error has been logged and will not affect other bot functionality.',
        ephemeral: true
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorResponse).catch(err => {
          console.error('Error sending error followUp for botpermissions command:', err);
        });
      } else {
        await interaction.reply(errorResponse).catch(err => {
          console.error('Error sending error reply for botpermissions command:', err);
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
    } catch (err) {
      // Comprehensive error handling to prevent affecting core bot functionality
      console.error('Error handling permissions button (protected):', err);
      
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
        console.error('Error sending permissions button error reply:', replyError);
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
    } catch (err) {
      // Comprehensive error handling to prevent affecting core bot functionality
      console.error('Error handling permissions select menu (protected):', err);
      
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
        console.error('Error sending permissions select menu error reply:', replyError);
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
    await rolePermissions.setPermissionsEnabled(interaction.guildId, enabled);
    
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
      .setFooter({ text: 'Brother Owl Bot' })
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
    
  } catch (err) {
    error('Error in handleEnable for bot permissions:', err);
    throw err; // Let the outer error handler catch it
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
    await rolePermissions.setRoleCategoryPermission(interaction.guildId, role.id, category, level);
    
    // Get permission level name
    const PERMISSION_LEVELS = rolePermissions.PERMISSION_LEVELS;
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
      [rolePermissions.COMMAND_CATEGORIES.WELCOME]: 'Welcome',
      [rolePermissions.COMMAND_CATEGORIES.FACTION_INFO]: 'Faction Info',
      [rolePermissions.COMMAND_CATEGORIES.STATS]: 'Stats',
      [rolePermissions.COMMAND_CATEGORIES.API_KEYS]: 'API Keys'
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
      .setFooter({ text: 'Brother Owl Bot' })
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
    
  } catch (err) {
    error('Error in handleSet for bot permissions:', err);
    throw err; // Let the outer error handler catch it
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
    
    // Get server permissions status
    const enabled = await rolePermissions.isPermissionsEnabled(interaction.guildId);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Bot Permissions')
      .setColor(enabled ? Colors.Blue : Colors.Grey)
      .setFooter({ text: 'Brother Owl Bot' })
      .setTimestamp();
    
    // Add system status
    embed.addFields({
      name: 'Permissions System',
      value: enabled ? '✅ Enabled' : '❌ Disabled',
      inline: false
    });
    
    // If role specified, show role permissions
    if (role) {
      const rolePerms = await rolePermissions.getRolePermissions(interaction.guildId, role.id);
      
      if (Object.keys(rolePerms).length === 0) {
        embed.setDescription(`No specific permissions set for role **${role.name}**.`);
      } else {
        embed.setDescription(`Permissions for role **${role.name}**:`);
        
        // Get permission level names
        const PERMISSION_LEVELS = rolePermissions.PERMISSION_LEVELS;
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
          [rolePermissions.COMMAND_CATEGORIES.WELCOME]: 'Welcome',
          [rolePermissions.COMMAND_CATEGORIES.FACTION_INFO]: 'Faction Info',
          [rolePermissions.COMMAND_CATEGORIES.STATS]: 'Stats',
          [rolePermissions.COMMAND_CATEGORIES.API_KEYS]: 'API Keys'
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
      const categories = rolePermissions.COMMAND_CATEGORIES;
      const categoryList = Object.values(categories)
        .map(category => {
          const commands = rolePermissions.getCategoryCommands(category);
          return `**${category}**: ${commands.map(cmd => `\`/${cmd}\``).join(', ')}`;
        })
        .join('\n\n');
      
      if (categoryList) {
        embed.addFields({
          name: 'Command Categories',
          value: categoryList,
          inline: false
        });
      }
      
      // Add view all button
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('permissions_view_all')
            .setLabel('View All Role Permissions')
            .setStyle(ButtonStyle.Primary)
        );
      
      return interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    }
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
    
  } catch (err) {
    error('Error in handleView for bot permissions:', err);
    throw err; // Let the outer error handler catch it
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
      .setDescription('**⚠️ Warning: This will reset all role permissions to default.**')
      .addFields({
        name: 'Confirmation Required',
        value: 'Are you sure you want to reset all role permissions for this server? This action cannot be undone.',
        inline: false
      })
      .setFooter({ text: 'Brother Owl Bot' })
      .setTimestamp();
    
    // Create confirmation buttons
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('permissions_reset_confirm')
          .setLabel('Reset All Permissions')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('permissions_reset_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
    
  } catch (err) {
    error('Error in handleReset for bot permissions:', err);
    throw err; // Let the outer error handler catch it
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
    // Get server permissions
    const serverPerms = await rolePermissions.getServerRolePermissions(interaction.guildId);
    const enabled = await rolePermissions.isPermissionsEnabled(interaction.guildId);
    
    if (!serverPerms.roles || Object.keys(serverPerms.roles).length === 0) {
      // No permissions set
      await interaction.update({
        content: 'No role permissions have been set for this server.',
        components: [],
        embeds: []
      });
      return;
    }
    
    // Create category select menu
    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('permissions_category_select')
          .setPlaceholder('Select a category to view')
          .addOptions(
            Object.values(rolePermissions.COMMAND_CATEGORIES).map(category => 
              new StringSelectMenuOptionBuilder()
                .setLabel(category)
                .setValue(category)
            )
          )
      );
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Role Permissions Overview')
      .setColor(enabled ? Colors.Blue : Colors.Grey)
      .setDescription('Select a category from the dropdown to view role permissions for that category.')
      .addFields({
        name: 'Permissions System',
        value: enabled ? '✅ Enabled' : '❌ Disabled',
        inline: false
      })
      .setFooter({ text: 'Brother Owl Bot' })
      .setTimestamp();
    
    await interaction.update({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
    
  } catch (err) {
    error('Error in handleViewAllPermissions for bot permissions:', err);
    throw err;
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
    // Get selected category
    const category = interaction.values[0];
    
    // Get server permissions for this category
    const serverPerms = await rolePermissions.getServerRolePermissions(interaction.guildId);
    const categoryRoles = serverPerms.categories[category] || {};
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle(`${category} Permissions`)
      .setColor(Colors.Blue)
      .setDescription(`Role permissions for the **${category}** category.`)
      .setFooter({ text: 'Brother Owl Bot' })
      .setTimestamp();
    
    // Get permission level names
    const PERMISSION_LEVELS = rolePermissions.PERMISSION_LEVELS;
    const levelNames = {
      [PERMISSION_LEVELS.NONE]: 'No Access',
      [PERMISSION_LEVELS.USE]: 'Use',
      [PERMISSION_LEVELS.CONTRIBUTE]: 'Contribute',
      [PERMISSION_LEVELS.MANAGE]: 'Manage',
      [PERMISSION_LEVELS.ADMIN]: 'Admin'
    };
    
    // Get commands in category
    const commands = rolePermissions.getCategoryCommands(category);
    
    if (commands.length > 0) {
      embed.addFields({
        name: 'Commands',
        value: commands.map(cmd => `\`/${cmd}\``).join(', '),
        inline: false
      });
    }
    
    // Add roles
    if (Object.keys(categoryRoles).length === 0) {
      embed.addFields({
        name: 'Roles',
        value: 'No roles have permissions for this category.',
        inline: false
      });
    } else {
      const rolesList = Object.entries(categoryRoles)
        .map(([roleId, level]) => `<@&${roleId}>: ${levelNames[level] || `Level ${level}`}`)
        .join('\n');
      
      embed.addFields({
        name: 'Roles',
        value: rolesList,
        inline: false
      });
    }
    
    // Create back button
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('permissions_view_all')
          .setLabel('Back to Categories')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.update({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
    
  } catch (err) {
    error('Error in handleCategorySelect for bot permissions:', err);
    throw err;
  }
}

/**
 * Handle role select menu
 * @param {StringSelectMenuInteraction} interaction - Discord select menu interaction
 * @param {Client} client - Discord client
 * @param {Object} rolePermissions - Role permissions service
 */
async function handleRoleSelect(interaction, client, rolePermissions) {
  try {
    // Get selected role
    const roleId = interaction.values[0].split(':')[1];
    
    // Get role permissions
    const rolePerms = await rolePermissions.getRolePermissions(interaction.guildId, roleId);
    
    // Get role object
    const role = await interaction.guild.roles.fetch(roleId);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setTitle(`Role Permissions: ${role.name}`)
      .setColor(role.color || Colors.Blue)
      .setFooter({ text: 'Brother Owl Bot' })
      .setTimestamp();
    
    if (Object.keys(rolePerms).length === 0) {
      embed.setDescription(`No specific permissions set for role **${role.name}**.`);
    } else {
      embed.setDescription(`Permissions for role **${role.name}**:`);
      
      // Get permission level names
      const PERMISSION_LEVELS = rolePermissions.PERMISSION_LEVELS;
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
        [rolePermissions.COMMAND_CATEGORIES.WELCOME]: 'Welcome',
        [rolePermissions.COMMAND_CATEGORIES.FACTION_INFO]: 'Faction Info',
        [rolePermissions.COMMAND_CATEGORIES.STATS]: 'Stats',
        [rolePermissions.COMMAND_CATEGORIES.API_KEYS]: 'API Keys'
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
    
    // Create back button
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('permissions_view_all')
          .setLabel('Back to Overview')
          .setStyle(ButtonStyle.Secondary)
      );
    
    await interaction.update({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
    
  } catch (err) {
    error('Error in handleRoleSelect for bot permissions:', err);
    throw err;
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
    const success = await rolePermissions.resetServerPermissions(interaction.guildId);
    
    if (success) {
      // Create success embed
      const embed = new EmbedBuilder()
        .setTitle('Permissions Reset')
        .setColor(Colors.Green)
        .setDescription('All role permissions have been reset to default.')
        .addFields({
          name: 'Status',
          value: 'Permissions system is now disabled, and all role permissions have been cleared.',
          inline: false
        })
        .setFooter({ text: 'Brother Owl Bot' })
        .setTimestamp();
      
      await interaction.update({
        embeds: [embed],
        components: [],
        ephemeral: true
      });
      
      log(`Reset all permissions for server ${interaction.guildId}`);
    } else {
      // Create error embed
      const embed = new EmbedBuilder()
        .setTitle('Error')
        .setColor(Colors.Red)
        .setDescription('There was an error resetting permissions.')
        .setFooter({ text: 'Brother Owl Bot' })
        .setTimestamp();
      
      await interaction.update({
        embeds: [embed],
        components: [],
        ephemeral: true
      });
    }
    
  } catch (err) {
    error('Error in handleResetConfirm for bot permissions:', err);
    throw err;
  }
}

module.exports = botpermissionsCommand;
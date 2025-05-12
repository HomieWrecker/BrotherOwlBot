/**
 * Configuration settings for the Brother Owl Discord bot
 */

const BOT_CONFIG = {
  // Bot appearance
  name: "Brother Owl",
  version: "1.0.0",
  color: 0x8B4513, // Brown color for owl theme
  
  // Features
  features: {
    welcome: {
      enabled: true
    }
  },
  
  // Bot configuration
  config: {
    logging: true,
    debugMode: false
  },
  
  // Default permissions
  permissions: {
    adminOnly: true, // Whether certain commands are restricted to admin users
  }
};

// Default embed template
const DEFAULT_EMBED = {
  color: BOT_CONFIG.color,
  footer: {
    text: `${BOT_CONFIG.name} v${BOT_CONFIG.version}`
  }
};

module.exports = {
  BOT_CONFIG,
  DEFAULT_EMBED
};

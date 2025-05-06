/**
 * Configuration settings for the BrotherOwl Discord bot
 */

const BOT_CONFIG = {
  // Bot appearance
  name: "BrotherOwlManager",
  version: "1.0.0",
  color: 0x8B4513, // Brown color for owl theme
  
  // Features
  features: {
    chain: {
      enabled: true,
      refreshInterval: 5 * 60 * 1000 // 5 minutes in milliseconds
    },
    // Add more features as they're implemented
  },
  
  // WebSocket configuration
  websocket: {
    reconnectAttempts: 10,
    reconnectDelayBase: 5000, // 5 seconds
    heartbeatInterval: 30000 // 30 seconds
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

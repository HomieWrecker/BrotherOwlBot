const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { log, logError } = require('../utils/logger');

// Database setup
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'brother_owl.db');

// Make sure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class StatTrackerService {
  constructor() {
    this.db = null;
    this.initialize();
  }

  /**
   * Initialize the SQLite database
   */
  initialize() {
    try {
      this.db = new sqlite3.Database(DB_FILE, (err) => {
        if (err) {
          logError('Error connecting to SQLite database:', err);
          return;
        }
        log('Connected to the SQLite database');
        this.createTables();
      });
    } catch (error) {
      logError('Error initializing database:', error);
    }
  }

  /**
   * Create the necessary tables if they don't exist
   */
  createTables() {
    const createStatHistoryTable = `
      CREATE TABLE IF NOT EXISTS stat_history (
        player_id TEXT,
        timestamp TEXT,
        strength INTEGER,
        defense INTEGER,
        speed INTEGER,
        dexterity INTEGER,
        total INTEGER,
        level INTEGER,
        xanax_used INTEGER,
        energy_used INTEGER,
        PRIMARY KEY (player_id, timestamp)
      )
    `;

    const createFactionInfoTable = `
      CREATE TABLE IF NOT EXISTS faction_info (
        faction_id TEXT PRIMARY KEY,
        last_updated TEXT,
        faction_data TEXT
      )
    `;

    this.db.serialize(() => {
      this.db.run(createStatHistoryTable, (err) => {
        if (err) {
          logError('Error creating stat_history table:', err);
          return;
        }
        log('Stat history table ready');
      });

      this.db.run(createFactionInfoTable, (err) => {
        if (err) {
          logError('Error creating faction_info table:', err);
          return;
        }
        log('Faction info table ready');
      });
    });
  }

  /**
   * Store a user's current stats
   * @param {string} playerId - Player ID
   * @param {Object} stats - Player stats object
   * @returns {Promise<boolean>} Success status
   */
  storePlayerStats(playerId, stats) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const now = new Date().toISOString();
      const sql = `
        INSERT INTO stat_history 
        (player_id, timestamp, strength, defense, speed, dexterity, total, level, xanax_used, energy_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const total = (stats.strength || 0) + (stats.defense || 0) + 
                    (stats.speed || 0) + (stats.dexterity || 0);

      this.db.run(sql, [
        playerId,
        now,
        stats.strength || 0,
        stats.defense || 0,
        stats.speed || 0,
        stats.dexterity || 0,
        total,
        stats.level || 0,
        stats.xanax_used || 0,
        stats.energy_used || 0
      ], (err) => {
        if (err) {
          logError(`Error storing stats for player ${playerId}:`, err);
          reject(err);
          return;
        }
        log(`Stored stats for player ${playerId}`);
        resolve(true);
      });
    });
  }

  /**
   * Get a player's most recent stats
   * @param {string} playerId - Player ID
   * @returns {Promise<Object|null>} Player stats object or null if not found
   */
  getPlayerLatestStats(playerId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const sql = `
        SELECT * FROM stat_history 
        WHERE player_id = ? 
        ORDER BY timestamp DESC 
        LIMIT 1
      `;

      this.db.get(sql, [playerId], (err, row) => {
        if (err) {
          logError(`Error getting latest stats for player ${playerId}:`, err);
          reject(err);
          return;
        }

        resolve(row || null);
      });
    });
  }

  /**
   * Get player's stats from a week ago
   * @param {string} playerId - Player ID
   * @returns {Promise<Object|null>} Player stats object or null if not found
   */
  getPlayerWeekAgoStats(playerId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      // Calculate the date one week ago
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const weekAgoStr = oneWeekAgo.toISOString();

      const sql = `
        SELECT * FROM stat_history 
        WHERE player_id = ? AND timestamp <= ?
        ORDER BY timestamp DESC 
        LIMIT 1
      `;

      this.db.get(sql, [playerId, weekAgoStr], (err, row) => {
        if (err) {
          logError(`Error getting week-ago stats for player ${playerId}:`, err);
          reject(err);
          return;
        }

        resolve(row || null);
      });
    });
  }

  /**
   * Get player's stats from a month ago
   * @param {string} playerId - Player ID
   * @returns {Promise<Object|null>} Player stats object or null if not found
   */
  getPlayerMonthAgoStats(playerId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      // Calculate the date one month ago
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const monthAgoStr = oneMonthAgo.toISOString();

      const sql = `
        SELECT * FROM stat_history 
        WHERE player_id = ? AND timestamp <= ?
        ORDER BY timestamp DESC 
        LIMIT 1
      `;

      this.db.get(sql, [playerId, monthAgoStr], (err, row) => {
        if (err) {
          logError(`Error getting month-ago stats for player ${playerId}:`, err);
          reject(err);
          return;
        }

        resolve(row || null);
      });
    });
  }

  /**
   * Store faction information for later retrieval
   * @param {string} factionId - Faction ID
   * @param {Object} factionData - Faction data object
   * @returns {Promise<boolean>} Success status
   */
  storeFactionInfo(factionId, factionData) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const now = new Date().toISOString();
      const sql = `
        INSERT OR REPLACE INTO faction_info 
        (faction_id, last_updated, faction_data)
        VALUES (?, ?, ?)
      `;

      this.db.run(sql, [
        factionId,
        now,
        JSON.stringify(factionData)
      ], (err) => {
        if (err) {
          logError(`Error storing faction info for ${factionId}:`, err);
          reject(err);
          return;
        }
        log(`Stored faction info for faction ${factionId}`);
        resolve(true);
      });
    });
  }

  /**
   * Get the latest faction information
   * @param {string} factionId - Faction ID
   * @returns {Promise<Object|null>} Faction data object or null if not found
   */
  getFactionInfo(factionId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const sql = `
        SELECT * FROM faction_info 
        WHERE faction_id = ?
      `;

      this.db.get(sql, [factionId], (err, row) => {
        if (err) {
          logError(`Error getting faction info for ${factionId}:`, err);
          reject(err);
          return;
        }

        if (row && row.faction_data) {
          try {
            const factionData = JSON.parse(row.faction_data);
            resolve({
              ...factionData,
              last_updated: row.last_updated
            });
          } catch (parseError) {
            logError(`Error parsing faction data for ${factionId}:`, parseError);
            reject(parseError);
          }
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          logError('Error closing database:', err);
          return;
        }
        log('Database connection closed');
      });
    }
  }
}

// Create and export a singleton instance
const statTrackerService = new StatTrackerService();
module.exports = statTrackerService;
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

class KeyStorageService {
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
    const createApiKeysTable = `
      CREATE TABLE IF NOT EXISTS api_keys (
        user_id TEXT PRIMARY KEY,
        torn_api_key TEXT,
        tornstats_api_key TEXT,
        date_added TEXT,
        last_updated TEXT
      )
    `;

    this.db.run(createApiKeysTable, (err) => {
      if (err) {
        logError('Error creating api_keys table:', err);
        return;
      }
      log('API keys table ready');
    });
  }

  /**
   * Store a user's API key
   * @param {string} userId - Discord user ID
   * @param {string} keyType - Type of API key ('torn' or 'tornstats')
   * @param {string} apiKey - The API key to store
   * @returns {Promise<boolean>} Success status
   */
  storeApiKey(userId, keyType, apiKey) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const now = new Date().toISOString();
      const columnName = keyType === 'torn' ? 'torn_api_key' : 'tornstats_api_key';

      // Check if user exists
      this.db.get('SELECT user_id FROM api_keys WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          logError(`Error checking user ${userId}:`, err);
          reject(err);
          return;
        }

        if (row) {
          // Update existing user
          const sql = `UPDATE api_keys SET ${columnName} = ?, last_updated = ? WHERE user_id = ?`;
          this.db.run(sql, [apiKey, now, userId], (updateErr) => {
            if (updateErr) {
              logError(`Error updating ${keyType} API key for user ${userId}:`, updateErr);
              reject(updateErr);
              return;
            }
            log(`Updated ${keyType} API key for user ${userId}`);
            resolve(true);
          });
        } else {
          // Insert new user
          const sql = `INSERT INTO api_keys (user_id, ${columnName}, date_added, last_updated) VALUES (?, ?, ?, ?)`;
          this.db.run(sql, [userId, apiKey, now, now], (insertErr) => {
            if (insertErr) {
              logError(`Error storing ${keyType} API key for user ${userId}:`, insertErr);
              reject(insertErr);
              return;
            }
            log(`Stored ${keyType} API key for new user ${userId}`);
            resolve(true);
          });
        }
      });
    });
  }

  /**
   * Get a user's API key
   * @param {string} userId - Discord user ID
   * @param {string} keyType - Type of API key to get ('torn' or 'tornstats')
   * @returns {Promise<string|null>} The API key or null if not found
   */
  getApiKey(userId, keyType) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const columnName = keyType === 'torn' ? 'torn_api_key' : 'tornstats_api_key';
      const sql = `SELECT ${columnName} FROM api_keys WHERE user_id = ?`;

      this.db.get(sql, [userId], (err, row) => {
        if (err) {
          logError(`Error getting ${keyType} API key for user ${userId}:`, err);
          reject(err);
          return;
        }

        if (row) {
          resolve(row[columnName]);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Delete all API keys for a user
   * @param {string} userId - Discord user ID
   * @returns {Promise<boolean>} Success status
   */
  deleteAllKeys(userId) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.run('DELETE FROM api_keys WHERE user_id = ?', [userId], (err) => {
        if (err) {
          logError(`Error removing API keys for user ${userId}:`, err);
          reject(err);
          return;
        }
        log(`Removed all API keys for user ${userId}`);
        resolve(true);
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
const keyStorageService = new KeyStorageService();
module.exports = keyStorageService;
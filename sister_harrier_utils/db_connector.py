"""
SQLite Database Connector for Sister Harrier Bot

This module provides a connector to the shared database used by Brother Owl,
allowing Sister Harrier to access shared data like API keys and permissions.
"""

import os
import sqlite3
import logging
import time
from typing import List, Dict, Optional, Tuple, Any, Union

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('SisterHarrierDB')

# Permission levels (must match Brother Owl's levels)
class PermissionLevel:
    NONE = 0
    USE = 1
    CONTRIBUTE = 2
    MANAGE = 3
    ADMIN = 4

# Command categories (must match Brother Owl's categories)
class CommandCategory:
    ADMINISTRATION = 'administration'
    FACTION_INFO = 'faction_info'
    WELCOME = 'welcome'
    STATS = 'stats'
    API_KEYS = 'api_keys'
    SPY = 'spy'  # Additional category for Sister Harrier
    WAR = 'war'  # Additional category for Sister Harrier

# Map commands to categories
COMMAND_CATEGORY_MAP = {
    # Sister Harrier commands should be mapped here
    'spy': CommandCategory.SPY,
    'target': CommandCategory.SPY,
    'war': CommandCategory.WAR,
    'warpay': CommandCategory.WAR,
    'warstrategy': CommandCategory.WAR,
    # Add more commands as needed
}

class DatabaseConnector:
    """
    Connector class for the shared SQLite database between Brother Owl and Sister Harrier.
    """
    
    def __init__(self, db_path: str = './data/brother_owl.db'):
        """
        Initialize database connection.
        
        Args:
            db_path: Path to the SQLite database file
        """
        self.db_path = db_path
        self.conn = None
        self.cursor = None
        self._connect()
    
    def _connect(self) -> None:
        """Establish connection to the database."""
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            
            # Connect to database
            self.conn = sqlite3.connect(self.db_path)
            self.conn.row_factory = sqlite3.Row  # Return rows as dictionaries
            self.cursor = self.conn.cursor()
            logger.info(f"Connected to database at {self.db_path}")
        except sqlite3.Error as e:
            logger.error(f"Database connection error: {e}")
            raise
    
    def close(self) -> None:
        """Close database connection."""
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")
    
    def execute(self, query: str, params: tuple = ()) -> Any:
        """
        Execute an SQL query.
        
        Args:
            query: SQL query string
            params: Parameters for the SQL query
            
        Returns:
            Query result
        """
        try:
            if self.cursor is None:
                self._connect()
            self.cursor.execute(query, params)
            if self.conn is not None:
                self.conn.commit()
            return self.cursor
        except sqlite3.Error as e:
            logger.error(f"SQL execution error: {e}")
            logger.error(f"Query: {query}, Params: {params}")
            if self.conn is not None:
                self.conn.rollback()
            raise
    
    def fetchone(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """
        Fetch a single row from the database.
        
        Args:
            query: SQL query string
            params: Parameters for the SQL query
            
        Returns:
            A single row as a dictionary, or None if no rows found
        """
        cursor = self.execute(query, params)
        result = cursor.fetchone()
        return dict(result) if result else None
    
    def fetchall(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """
        Fetch all rows from the database.
        
        Args:
            query: SQL query string
            params: Parameters for the SQL query
            
        Returns:
            List of rows as dictionaries
        """
        cursor = self.execute(query, params)
        if cursor is None:
            return []
        result = cursor.fetchall()
        if result is None:
            return []
        return [dict(row) for row in result]
    
    def get_user_api_key(self, user_id: str, key_type: str = 'torn') -> Optional[str]:
        """
        Get a user's API key.
        
        Args:
            user_id: Discord user ID
            key_type: Type of API key ('torn' or 'tornstats')
            
        Returns:
            API key string or None if not found
        """
        column = 'torn_api_key' if key_type == 'torn' else 'tornstats_api_key'
        query = f'SELECT {column} FROM api_keys WHERE user_id = ?'
        result = self.fetchone(query, (user_id,))
        return result[column] if result else None
    
    def is_permissions_enabled(self, server_id: str) -> bool:
        """
        Check if permissions are enabled for a server.
        
        Args:
            server_id: Discord server ID
            
        Returns:
            True if permissions are enabled, False otherwise
        """
        query = 'SELECT enabled FROM server_permissions_settings WHERE server_id = ?'
        result = self.fetchone(query, (server_id,))
        return bool(result['enabled']) if result else False
    
    def get_command_category(self, command_name: str) -> Optional[str]:
        """
        Get the category for a command.
        
        Args:
            command_name: Command name
            
        Returns:
            Category name or None if not found
        """
        return COMMAND_CATEGORY_MAP.get(command_name)
    
    def get_role_permission(self, server_id: str, role_id: str, 
                          category: str) -> int:
        """
        Get the permission level for a role and category.
        
        Args:
            server_id: Discord server ID
            role_id: Discord role ID
            category: Command category
            
        Returns:
            Permission level (0-4)
        """
        query = '''
            SELECT permission_level 
            FROM role_permissions 
            WHERE server_id = ? AND role_id = ? AND category = ?
        '''
        result = self.fetchone(query, (server_id, role_id, category))
        return result['permission_level'] if result else PermissionLevel.NONE
    
    async def has_permission(self, server_id: str, user_role_ids: List[str], 
                          command_name: str, required_level: int = PermissionLevel.USE) -> bool:
        """
        Check if a user has permission to use a command.
        
        Args:
            server_id: Discord server ID
            user_role_ids: List of Discord role IDs the user has
            command_name: Command name
            required_level: Required permission level (default: USE)
            
        Returns:
            True if user has permission, False otherwise
        """
        # Check if permissions are enabled
        if not self.is_permissions_enabled(server_id):
            return True
        
        # Get command category
        category = self.get_command_category(command_name)
        if not category:
            return True  # Commands without categories are allowed
        
        # Get highest permission level from user's roles
        highest_level = PermissionLevel.NONE
        for role_id in user_role_ids:
            level = self.get_role_permission(server_id, role_id, category)
            highest_level = max(highest_level, level)
        
        return highest_level >= required_level
    
    def get_stat_history(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get a user's stat history.
        
        Args:
            user_id: Discord user ID
            
        Returns:
            List of dictionaries containing stat history
        """
        query = 'SELECT * FROM stat_history WHERE user_id = ? ORDER BY timestamp DESC'
        results = self.fetchall(query, (user_id,))
        return results
    
    def save_spy_data(self, target_id: str, user_id: str, 
                     spy_data: Dict[str, Any]) -> None:
        """
        Save spy data for a target.
        
        Args:
            target_id: Torn ID of the target
            user_id: Discord user ID of the person who spied
            spy_data: Dictionary containing spy data
        """
        # Check if spies table exists, create if not
        self.execute('''
            CREATE TABLE IF NOT EXISTS spies (
                target_id TEXT,
                user_id TEXT,
                timestamp INTEGER,
                strength INTEGER,
                speed INTEGER,
                dexterity INTEGER,
                defense INTEGER,
                total REAL,
                source TEXT,
                confidence TEXT,
                PRIMARY KEY (target_id, user_id, timestamp)
            )
        ''')
        
        # Insert spy data
        query = '''
            INSERT OR REPLACE INTO spies 
            (target_id, user_id, timestamp, strength, speed, dexterity, 
             defense, total, source, confidence) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        self.execute(query, (
            target_id,
            user_id,
            spy_data.get('timestamp', int(time.time())),
            spy_data.get('strength', 0),
            spy_data.get('speed', 0),
            spy_data.get('dexterity', 0),
            spy_data.get('defense', 0),
            spy_data.get('total', 0),
            spy_data.get('source', 'manual'),
            spy_data.get('confidence', 'medium')
        ))
        
    def get_spy_data(self, target_id: str) -> List[Dict[str, Any]]:
        """
        Get spy data for a target.
        
        Args:
            target_id: Torn ID of the target
            
        Returns:
            List of spy data entries
        """
        query = 'SELECT * FROM spies WHERE target_id = ? ORDER BY timestamp DESC'
        return self.fetchall(query, (target_id,))
    
    def get_all_server_roles(self, server_id: str) -> Dict[str, Dict[str, int]]:
        """
        Get all role permissions for a server.
        
        Args:
            server_id: Discord server ID
            
        Returns:
            Dictionary of role_id -> {category -> permission_level}
        """
        query = '''
            SELECT role_id, category, permission_level 
            FROM role_permissions 
            WHERE server_id = ?
        '''
        results = self.fetchall(query, (server_id,))
        
        roles = {}
        for row in results:
            role_id = row['role_id']
            category = row['category']
            level = row['permission_level']
            
            if role_id not in roles:
                roles[role_id] = {}
            
            roles[role_id][category] = level
        
        return roles
    
    def register_command_category(self, command_name: str, category: str) -> None:
        """
        Register a new command with its category.
        
        Args:
            command_name: Command name
            category: Category name
        """
        global COMMAND_CATEGORY_MAP
        COMMAND_CATEGORY_MAP[command_name] = category
        logger.info(f"Registered command {command_name} in category {category}")

# Create an initializer function to be called at bot startup
def initialize_db(db_path: str = './data/brother_owl.db') -> DatabaseConnector:
    """
    Initialize the database connector.
    
    Args:
        db_path: Path to the SQLite database file
        
    Returns:
        DatabaseConnector instance
    """
    db = DatabaseConnector(db_path)
    logger.info("Database connector initialized")
    return db

# Example usage
if __name__ == "__main__":
    # Test the database connector
    db = DatabaseConnector()
    try:
        # Example: Check if a table exists
        db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'")
        tables = db.cursor.fetchall()
        print(f"Tables: {tables}")
        
        # Example: Test API key retrieval
        test_user_id = "123456789"
        api_key = db.get_user_api_key(test_user_id)
        print(f"API Key for {test_user_id}: {'Exists' if api_key else 'Not found'}")
        
    finally:
        db.close()
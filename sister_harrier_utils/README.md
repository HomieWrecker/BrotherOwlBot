# Sister Harrier Utilities

This package contains utility modules for the Sister Harrier Discord bot, which is designed to work alongside Brother Owl bot.

## Database Connector

The primary utility provided is a SQLite database connector that enables Sister Harrier to access the shared database with Brother Owl. This integration allows both bots to share:

- User API keys
- Permission settings
- Spy data
- Stats tracking information

## Usage

### Initialization

```python
from sister_harrier_utils import DatabaseConnector, PermissionLevel, CommandCategory

# Initialize the database connector
db = DatabaseConnector()
```

### Checking Permissions

```python
# Get user role IDs
user_role_ids = [str(role.id) for role in member.roles]

# Check if user has permission to use a command
has_permission = await db.has_permission(
    server_id=server_id,
    user_role_ids=user_role_ids,
    command_name="spy",
    required_level=PermissionLevel.CONTRIBUTE
)
```

### Accessing API Keys

```python
# Get a user's Torn API key
api_key = db.get_user_api_key(user_id)

# Get a user's TornStats API key
tornstats_key = db.get_user_api_key(user_id, key_type='tornstats')
```

### Managing Spy Data

```python
# Save spy data
spy_data = {
    'timestamp': int(time.time()),
    'strength': 1000000,
    'speed': 800000,
    'dexterity': 900000,
    'defense': 950000,
    'total': 3650000,
    'source': 'manual',
    'confidence': 'high'
}
db.save_spy_data(target_id, user_id, spy_data)

# Get spy data for a target
spy_history = db.get_spy_data(target_id)
```

### Accessing Stats History

```python
# Get a user's stat history
stats_history = db.get_stat_history(user_id)
```

## Permission Levels

The permission system uses the following levels:

- `PermissionLevel.NONE` (0): No access
- `PermissionLevel.USE` (1): Can use basic read-only functionality
- `PermissionLevel.CONTRIBUTE` (2): Can contribute data and interact
- `PermissionLevel.MANAGE` (3): Can manage and configure
- `PermissionLevel.ADMIN` (4): Full admin access

## Command Categories

Commands are organized into the following categories:

- `CommandCategory.ADMINISTRATION`: Admin commands
- `CommandCategory.FACTION_INFO`: Faction information commands
- `CommandCategory.WELCOME`: Welcome system commands
- `CommandCategory.STATS`: Stats tracking commands
- `CommandCategory.API_KEYS`: API key management commands
- `CommandCategory.SPY`: Spy-related commands
- `CommandCategory.WAR`: War-related commands
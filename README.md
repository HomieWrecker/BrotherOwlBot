# Brother Owl Discord Bot

A streamlined Discord bot for Torn faction groups that offers welcome functionality, member management, secure API key storage, personal stat tracking, and detailed faction information with multi-bot support.

## Features

- New member welcome system
- Customizable role assignment
- Membership verification process
- Server-specific configuration
- Secure API key storage with SQLite database
- Support for both Torn API and TornStats API keys
- Personal battle stats tracking with gain history
- Faction member status monitoring
- Xanax and energy usage tracking
- Interactive information displays

## Commands

The bot provides the following slash commands:

- `/welcome setup` - Configure the welcome system (admin only)
- `/welcome status` - Check the current welcome configuration (admin only)
- `/welcome disable` - Disable the welcome system (admin only)
- `/apikey` - Manage your Torn API and TornStats API keys
- `/stats` - View your Torn battle stats and track stat gains
- `/factioninfo` - View detailed information about your faction members
- `/botpermissions` - Configure role-based access control for commands (admin only)
- `/ping` - Check bot status, latency, uptime, and server information

## Welcome System

The welcome system offers the following features:
- Customizable welcome messages for new members
- Role selection options (Member, Ally, Trader, Guest)
- Member verification process with approval roles
- Logging of member events (join, leave, verification)

## API Key System

The API key system offers the following features:
- Secure storage of user API keys in SQLite database
- Support for both Torn API and TornStats API keys
- Key validation and access level detection
- Privacy-focused design with key masking
- Shared database for multiple bot instances
- Easy key management interface

## Stats Tracking System

The stats tracking system offers the following features:
- Track personal battle stats over time
- View growth since last check and monthly comparisons
- Detailed breakdown of strength, defense, speed, and dexterity gains
- Persistent tracking with SQLite database storage
- Private stats reporting for individual users

## Faction Information System

The faction information system offers the following features:
- Real-time faction member status (online/offline with time tracking)
- Detailed xanax usage tracking for faction members
- Energy usage monitoring for faction members
- Interactive buttons to switch between different information views
- Sorted member lists by position and online status

## Role-Based Permissions System

The role-based permissions system offers the following features:
- Control command access based on Discord roles
- Granular permission levels (No Access, Use, Contribute, Manage, Admin)
- Organized commands into logical categories for easier management
- Category-based permission assignment
- Persistent storage using SQLite database
- Interactive UI for managing permissions
- Comprehensive overview of all role permissions
- Easy permission reset and management options

## Requirements

- Node.js v14.0.0 or higher
- SQLite3 (included in dependencies)
- Discord.js v14.x
- A Discord bot token
- Discord Administrator permissions to configure the welcome system

## Environment Variables

The following environment variables are required:

- `DISCORD_TOKEN` - Your Discord bot token

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Start the bot: `node index.js`

**Important:** Only run one instance of the bot at a time. Running multiple instances with the same token will cause conflicts in Discord's API.

## GitHub Integration for Synology Deployment

This bot is designed to be deployed from GitHub to a Synology NAS. Here's how to set up the integration:

1. Create a GitHub repository for this project
2. Push the code to your GitHub repository
3. On your Synology NAS, install Git from Package Center
4. Use SSH or File Station to navigate to the desired directory
5. Clone the repository: `git clone https://github.com/your-username/your-repo.git`
6. Set up a pull script to keep the bot updated:

```bash
#!/bin/bash
# sync-bot.sh
cd /path/to/your/bot
git pull
# Restart the bot (if using PM2)
pm2 restart Brother-Owl-Bot
```

7. Add this script to Task Scheduler to automatically sync with GitHub

## Deployment Options

### Synology NAS Deployment

To deploy on a Synology NAS (including support for multiple bots sharing the same database):

1. Install Docker on your Synology NAS
2. Pull the Node.js image
3. Set up a Docker container with the following settings:
   - Mount the bot directory to a volume
   - Set the environment variable DISCORD_TOKEN
   - Configure container to auto-restart
   - Map no ports (not needed for Discord bot)
4. Start the container with the command: `node index.js`

Alternatively, you can use Synology's Task Scheduler with Node.js installed:

1. Install Node.js via Package Center
2. Create a scheduled task to run: `cd /path/to/bot && node index.js`
3. Set it to run at startup and restart on failure

### PM2 Process Management (Recommended)

For the most reliable operation on Synology or any Linux server:

1. Install Node.js and PM2: `npm install -g pm2`
2. Navigate to bot directory
3. Start with PM2: `pm2 start index.js --name "Brother-Owl-Bot"`
4. Configure PM2 to start at system boot: `pm2 startup`
5. Save the PM2 configuration: `pm2 save`

PM2 provides monitoring, auto-restart, and logs management.

## Project Structure

```
├── src
│   ├── commands       # Command implementations
│   │   ├── welcome.js # Welcome command
│   │   ├── apikey.js  # API key management command
│   │   └── index.js   # Command registration system
│   ├── services       # Service modules
│   │   ├── welcome-service.js    # Welcome service 
│   │   └── key-storage-service.js # SQLite-based API key storage
│   ├── utils          # Utility functions (formatting.js, logger.js)
│   ├── bot.js         # Main bot logic
│   └── config.js      # Bot configuration
├── data               # Persistent data storage
│   ├── welcome_configs.json # Welcome system configuration
│   └── brother_owl.db # SQLite database for API keys
├── index.js           # Entry point
└── package.json       # Project metadata
```

Additional folders like `backup_commands`, `backup_services`, and `backup_utils` contain the backed-up components that were removed from the streamlined version but may be restored in the future.

## Multi-Bot Data Sharing

The bot uses a SQLite database (`data/brother_owl.db`) to store API keys, which enables data sharing between multiple bot instances. This is particularly useful when running different bots that need access to the same user API keys.

### How It Works

1. All API keys are stored in a central SQLite database
2. Each bot instance connects to the same database file
3. When a user sets their API key in one bot, it becomes available to all other bots
4. This prevents users from having to register their API keys multiple times

### Implementation Details

- The database uses a simple schema with a single `api_keys` table
- Each user's Discord ID serves as the primary key
- Both Torn API and TornStats API keys are stored in separate columns
- Key validation and access level checks are performed before storage
- All database operations are handled by the `key-storage-service.js` module

## License

MIT License
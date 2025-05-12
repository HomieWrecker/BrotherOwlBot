# Brother Owl Discord Bot

A streamlined Discord bot for Torn faction groups that offers welcome functionality and member management.

## Features

- New member welcome system
- Customizable role assignment
- Membership verification process
- Server-specific configuration

## Commands

The bot provides the following slash command:

- `/welcome setup` - Configure the welcome system (admin only)
- `/welcome status` - Check the current welcome configuration (admin only)
- `/welcome disable` - Disable the welcome system (admin only)

## Welcome System

The welcome system offers the following features:
- Customizable welcome messages for new members
- Role selection options (Member, Ally, Trader, Guest)
- Member verification process with approval roles
- Logging of member events (join, leave, verification)

## Requirements

- Node.js v14.0.0 or higher
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

To deploy on a Synology NAS:

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
│   ├── commands       # Command implementations (welcome.js, index.js)
│   ├── services       # Service modules (welcome-service.js)
│   ├── utils          # Utility functions (formatting.js, logger.js)
│   ├── bot.js         # Main bot logic
│   └── config.js      # Bot configuration
├── data               # Persistent data storage (welcome_configs.json)
├── index.js           # Entry point
└── package.json       # Project metadata
```

Additional folders like `backup_commands`, `backup_services`, and `backup_utils` contain the backed-up components that were removed from the streamlined version but may be restored in the future.

## License

MIT License
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

## Project Structure

```
├── src
│   ├── commands       # Command implementations
│   ├── services       # Service modules
│   ├── utils          # Utility functions
│   ├── bot.js         # Main bot logic
│   └── config.js      # Bot configuration
├── index.js           # Entry point
└── package.json       # Project metadata
```

## License

MIT License
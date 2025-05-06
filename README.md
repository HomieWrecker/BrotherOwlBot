# BrotherOwlManager Discord Bot

A Discord bot for Torn faction groups that connects to the Torn API and provides real-time faction information and management tools.

## Features

- Real-time chain status monitoring
- Faction member activity tracking
- Faction statistics display
- Bot status monitoring
- Command help system

## Commands

The bot provides the following slash commands:

- `/chain` - Get the current faction chain status (count, timeout, etc.)
- `/members` - View faction members list with status and position information
- `/activity` - View recent faction activity logs
- `/stats` - View faction statistics (respect, territories, etc.)
- `/status` - Check the bot and API connection status
- `/help` - Get help with available commands

## Requirements

- Node.js v14.0.0 or higher
- Discord.js v14.x
- A Discord bot token
- A Torn API key with faction access

## Environment Variables

The following environment variables are required:

- `DISCORD_TOKEN` - Your Discord bot token
- `TORN_API_KEY` - Your Torn API key with faction access

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Start the bot: `node index.js`

## Project Structure

```
├── src
│   ├── commands       # Command implementations
│   ├── utils          # Utility functions
│   ├── bot.js         # Main bot logic
│   ├── config.js      # Bot configuration
│   └── torn-ws.js     # Torn API connection handler
├── index.js           # Entry point
└── package.json       # Project metadata
```

## License

MIT License

## Credits

Created by [Your Name] using Discord.js and the Torn API.
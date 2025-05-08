# BrotherOwl Bot - Torn Faction Manager

A comprehensive Discord bot for managing Torn factions, tracking enemy stats, and providing valuable intel.

## Features

- **Enemy Stats Tracking**: Save and retrieve spy data on enemy players
- **Stat Estimation**: Estimate enemy stats based on battle performance
- **Battle Recommendations**: Get recommendations for attacking based on stat comparisons
- **Discord Integration**: Fully integrated with Discord slash commands and embeds

## Installation

1. **Requirements**:
   - Python 3.7+ (recommended Python 3.11)
   - Node.js 16+ (for full bot functionality)
   - Discord Bot Token
   - Torn API Key

2. **Setup**:
   - Clone this repository
   - Create a `.env` file with your credentials (see below)
   - Install dependencies: `pip install -r requirements.txt`
   - For full bot: `npm install`

3. **Run**:
   - For Python version: `python main.py`
   - For full bot: `node index.js`

## Environment Variables

Create a `.env` file with the following:

```
DISCORD_TOKEN=your_discord_token_here
TORN_API_KEY=your_torn_api_key_here
```

## Commands

### Python Version Commands

- `!enemy_stats <player_id>`: Look up saved spy data for a player
- `!enemy_stats <player_id> <damage> <turns> <my_primary_stat>`: Estimate stats based on battle
- `!add_spy <player_id> <str> <spd> <dex> <def>`: Add/update spy data
- `!help_spy`: Show spy command help

### Full Bot Discord Slash Commands

- `/spy lookup <player_id>`: Look up player stats
- `/spy add <player_id> <str> <spd> <dex> <def>`: Add spy data
- `/spy estimate <player_id> <damage> <turns> <my_primary_stat>`: Estimate stats

## Data Storage

Player spy data is stored in:
- `data/spies.json`: Stores all player spy data with timestamps

## Deploy on Synology NAS (24/7)

1. Install Node.js package on your Synology NAS
2. Deploy the files to your NAS
3. Install PM2: `npm install -g pm2`
4. Start: `pm2 start index.js --name "BrotherOwlBot"`
5. Auto-start: `pm2 startup` and `pm2 save`
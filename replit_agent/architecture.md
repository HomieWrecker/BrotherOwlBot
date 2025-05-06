# Architecture Overview

## 1. Overview

BrotherOwlManager is a Discord bot designed for Torn faction groups that connects to the Torn API to provide real-time faction information and management tools. The bot enables users to monitor chain status, track member activity, view faction statistics, and manage personal API keys for enhanced features.

The application follows a modular architecture with clear separation of concerns between different components. It is built with Node.js and uses Discord.js for Discord API integration and WebSocket for real-time communication with the Torn API.

## 2. System Architecture

The system follows a single-service architecture with the following key layers:

1. **Discord Integration Layer**: Handles all Discord-related functionality (commands, events, interactions)
2. **Torn API Integration Layer**: Manages connectivity with Torn's API systems
3. **Command Processing Layer**: Processes user commands and generates responses
4. **Data Storage Layer**: Simple file-based storage for persistent data
5. **Utility Services**: Common utilities for logging, formatting, etc.

```
+-------------------+     +------------------+     +------------------+
|   Discord Bot     |<--->|  Command Handler |<--->|  Torn API Client |
| (Discord.js)      |     |  (Command Files) |     |  (REST + WebSock)|
+-------------------+     +------------------+     +------------------+
         ^                        ^                        ^
         |                        |                        |
         v                        v                        v
+-------------------+     +------------------+     +------------------+
|    Utility        |     |  File-based      |     |  External        |
|    Services       |     |  Data Storage    |     |  Service         |
+-------------------+     +------------------+     |  Integrations    |
                                                   +------------------+
```

## 3. Key Components

### 3.1 Discord Bot (src/bot.js)

The main Discord client that:
- Initializes the bot with required permissions and intents
- Registers slash commands
- Handles command interactions and events
- Maintains connections to external services

Technology: Discord.js v14.x with slash command support

### 3.2 Torn API Integration (src/torn-ws.js)

Manages communication with the Torn API using:
- WebSocket for real-time data (primary method when available)
- REST API fallback when WebSocket becomes unstable
- Automatic reconnection and fallback logic

The component implements a dual-strategy approach to ensure reliability:
- When WebSocket is functioning, it provides real-time data updates
- When WebSocket fails, automatically falls back to REST API polling

### 3.3 Command System (src/commands/*)

A modular command system where each command is encapsulated in its own file:
- Commands register themselves with Discord via the central index.js
- Each command defines its own parameters and execution logic
- Common helpers for formatting and displaying information

Key commands include:
- `/chain`: Displays faction chain information
- `/members`: Shows faction member list and status
- `/activity`: Shows recent faction activity
- `/stats`: Displays faction statistics
- `/status`: Shows bot and API connection status
- `/apikey`: Allows users to set their personal Torn API keys
- `/playerstats`: Shows user-specific statistics
- `/help`: Provides information about available commands

### 3.4 Data Storage (data/*)

Simple file-based JSON storage for:
- User API keys (data/user_keys.json)
- Player statistics (data/player_stats.json)

This approach was chosen for simplicity, though it has limited scalability.

### 3.5 Service Integrations (src/services/integrations.js)

A unified interface for interacting with multiple Torn-related external services:
- Torn official API
- YATA
- Anarchy
- TornStats
- TornTools

### 3.6 Utility Services

Common utilities shared across the codebase:
- Logger (src/utils/logger.js): Consistent logging with timestamps and levels
- Formatting utilities (src/utils/formatting.js): Data formatting for display
- Configuration (src/config.js): Central configuration management

## 4. Data Flow

1. **Command Execution Flow**:
   - User issues a slash command in Discord
   - Discord.js forwards the command to the bot
   - Command handler identifies the appropriate command module
   - Command module executes business logic (often retrieving data)
   - Command formats and returns a response to Discord

2. **API Data Flow**:
   - WebSocket connection (or REST fallback) retrieves data from Torn API
   - Data is stored in the client.tornData object 
   - Commands access this data when needed
   - For personal data, user API keys are retrieved from storage
   - For persistent data, file-based storage is used

3. **User Configuration Flow**:
   - User sets API key via the `/apikey` command
   - Key is validated and stored in data/user_keys.json
   - Commands that need personal data retrieve the key
   - Personal statistics are optionally stored for tracking

## 5. External Dependencies

### 5.1 Primary Dependencies

- **discord.js**: Core library for Discord API integration
- **ws**: WebSocket library for Torn API real-time communication

### 5.2 External Services

- **Torn API**: Primary data source for faction and player information
- **Optional integrations**:
  - YATA: For additional statistical data
  - Anarchy: For advanced faction metrics
  - TornStats: For player statistics
  - TornTools: For additional tools and data

## 6. Deployment Strategy

The application uses a simple Node.js deployment approach:

1. **Environment Setup**:
   - Requires Node.js v14.0.0 or higher
   - Configuration via environment variables:
     - DISCORD_TOKEN: Bot token for Discord API
     - TORN_API_KEY: API key for Torn API access

2. **Execution**:
   - Application entry point is index.js
   - Bot initialization and component wiring in src/bot.js
   - Configuration in src/config.js

3. **Containerization**:
   - The application includes a workflow configuration (.replit) that suggests it's designed to run in containerized environments
   - Supports npm-based deployment with clear dependency specification

4. **Monitoring and Resilience**:
   - Global error handlers for uncaught exceptions
   - Graceful shutdown on SIGINT and SIGTERM
   - Logging infrastructure for operational visibility
   - Auto-reconnect logic for external services

## 7. Future Architecture Considerations

### 7.1 Scaling Concerns

- **Data Storage**: The current file-based storage is suitable for smaller deployments but would need to be replaced with a proper database for larger installations.

- **Rate Limiting**: For large factions or multiple guilds, Torn API rate limits may become an issue, requiring more sophisticated caching and request throttling.

- **Command Execution**: As command complexity grows, more structured command middleware might be beneficial.

### 7.2 Enhancement Opportunities

- **Database Integration**: Adding a proper database (SQL or NoSQL) would improve data persistence, querying, and scalability.

- **Command Framework**: The command system could evolve into a more structured framework with middleware, permissions, and advanced help systems.

- **Monitoring and Analytics**: Adding telemetry for command usage and performance would help guide future development.
"""
Example Sister Harrier Bot

This is a simplified example showing how Sister Harrier could use the shared database
with Brother Owl for permissions checking and data access.
"""

import discord
from discord import app_commands
import logging
import os
from typing import List

from sister_harrier_utils import DatabaseConnector, PermissionLevel, CommandCategory

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('SisterHarrier')

# Discord bot setup
intents = discord.Intents.default()
intents.message_content = True
intents.members = True
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)

# Initialize database connector
db = DatabaseConnector()

# Example spy command
@tree.command(name="spy", description="Track spy information about a target")
async def spy_command(interaction: discord.Interaction, target_id: str):
    # Check permissions
    if not interaction.guild or not isinstance(interaction.user, discord.Member):
        await interaction.response.send_message(
            "❌ This command can only be used in a server.",
            ephemeral=True
        )
        return
    
    member = interaction.user  # Now we know this is a discord.Member
    server_id = str(interaction.guild.id)
    user_role_ids = [str(role.id) for role in member.roles]
    
    # Example of permission checking
    has_permission = await db.has_permission(
        server_id=server_id,
        user_role_ids=user_role_ids,
        command_name="spy",
        required_level=PermissionLevel.CONTRIBUTE
    )
    
    if not has_permission:
        await interaction.response.send_message(
            "❌ You don't have permission to use this command.",
            ephemeral=True
        )
        return
    
    # Get user's API key using the shared database
    user_id = str(interaction.user.id)
    api_key = db.get_user_api_key(user_id)
    
    if not api_key:
        await interaction.response.send_message(
            "❌ You need to set your Torn API key first. Use `/apikey` in Brother Owl.",
            ephemeral=True
        )
        return
    
    # Get existing spy data (if any)
    existing_spy_data = db.get_spy_data(target_id)
    
    # For demonstration, just show if we have existing data
    if existing_spy_data:
        await interaction.response.send_message(
            f"Found {len(existing_spy_data)} existing spy entries for target {target_id}.",
            ephemeral=True
        )
    else:
        # Example of saving new spy data
        spy_data = {
            'timestamp': int(discord.utils.utcnow().timestamp()),
            'strength': 1000000,  # Example values
            'speed': 800000,
            'dexterity': 900000,
            'defense': 950000,
            'total': 3650000,
            'source': 'example',
            'confidence': 'high'
        }
        
        db.save_spy_data(target_id, user_id, spy_data)
        await interaction.response.send_message(
            f"✅ Saved new spy data for target {target_id}.",
            ephemeral=True
        )

@client.event
async def on_ready():
    logger.info(f'Sister Harrier is connected as {client.user}')
    await tree.sync()
    logger.info('Command tree synced')

# Example of how to run the bot
if __name__ == "__main__":
    # In a real bot, you would get the token from environment variables
    token = os.getenv('DISCORD_TOKEN')
    if token:
        client.run(token)
    else:
        logger.error('No Discord token found')
        print("Please set the DISCORD_TOKEN environment variable")
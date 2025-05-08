"""
BrotherOwl Bot - Torn Faction Manager
Main entry point for Discord bot functionality
"""

import os
import discord
from discord.ext import commands
import asyncio
import json
import logging
from dotenv import load_dotenv

# Import custom modules
from src.utils.stats_estimator import (
    get_spy_data, add_spy_data, estimate_primary_stat,
    estimate_total_stats, format_stats_for_display,
    get_stat_confidence, get_recommendation
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('BrotherOwlBot')

# Load environment variables
load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')
TORN_API_KEY = os.getenv('TORN_API_KEY')

# Initialize bot with intents
intents = discord.Intents.default()
intents.message_content = True
intents.members = True
bot = commands.Bot(command_prefix='!', intents=intents)

@bot.event
async def on_ready():
    """Called when the bot is ready and connected to Discord"""
    logger.info(f'Logged in as {bot.user.name} ({bot.user.id})')
    logger.info(f'Connected to {len(bot.guilds)} guilds')
    await bot.change_presence(activity=discord.Game(name="Torn | Stats Tracker"))
    
    # Ensure data files exist
    os.makedirs('data', exist_ok=True)
    if not os.path.exists('data/spies.json'):
        with open('data/spies.json', 'w') as f:
            json.dump({}, f)
        logger.info("Created empty spies.json file")

@bot.command(name="enemy_stats")
async def enemy_stats(ctx, player_id: str = "", damage: str = "", turns: str = "", my_primary_stat: str = ""):
    """
    Get enemy stats by player ID
    
    Usage:
    !enemy_stats <player_id>
    !enemy_stats <player_id> <damage> <turns> <my_primary_stat>
    """
    if not player_id:
        await ctx.send("Please provide a player ID. Usage: `!enemy_stats <player_id>` or `!enemy_stats <player_id> <damage> <turns> <my_primary_stat>`")
        return
    
    # Check if we have spy data for this player
    spy_data = get_spy_data(player_id)
    
    if spy_data:
        # We have saved spy data
        confidence = get_stat_confidence(spy_data)
        embed = discord.Embed(
            title=f"Spy Data for Player {player_id}",
            description=format_stats_for_display(player_id, spy_data, confidence),
            color=_get_color_for_confidence(confidence)
        )
        await ctx.send(embed=embed)
    
    elif all([damage, turns, my_primary_stat]):
        try:
            # Convert string inputs to integers
            damage_val = int(damage)
            turns_val = int(turns)
            primary_val = int(my_primary_stat)
            
            # We don't have spy data but have parameters to estimate
            primary_estimate = estimate_primary_stat(damage_val, turns_val, primary_val)
            total_estimate = estimate_total_stats(primary_estimate)
            
            estimated_data = {
                "primary": primary_estimate,
                "total": total_estimate
            }
            
            embed = discord.Embed(
                title=f"Estimated Stats for Player {player_id}",
                description=format_stats_for_display(player_id, estimated_data, "low"),
                color=discord.Color.yellow()
            )
            embed.add_field(
                name="Calculation Details",
                value=f"Based on {damage_val:,} damage over {turns_val} turns with your {primary_val:,} primary stat"
            )
            await ctx.send(embed=embed)
        except ValueError:
            await ctx.send("All values must be valid numbers. Please check your input and try again.")
    
    else:
        # Not enough info
        await ctx.send(f"No spy data found for player {player_id}. To estimate stats, use: `!enemy_stats {player_id} <damage> <turns> <my_primary_stat>`")

@bot.command(name="add_spy")
async def add_spy(ctx, player_id: str = "", strength: str = "", speed: str = "", dexterity: str = "", defense: str = ""):
    """
    Add spy data for a player
    
    Usage:
    !add_spy <player_id> <str> <spd> <dex> <def>
    """
    if not all([player_id, strength, speed, dexterity, defense]):
        await ctx.send("Please provide all required parameters. Usage: `!add_spy <player_id> <str> <spd> <dex> <def>`")
        return
    
    try:
        # Convert string inputs to integers
        str_val = int(strength)
        spd_val = int(speed)
        dex_val = int(dexterity)
        def_val = int(defense)
        
        # Add the spy data
        spy_data = add_spy_data(player_id, str_val, spd_val, dex_val, def_val)
    except ValueError:
        await ctx.send("All stat values must be valid numbers.")
        return
    
    # Confirm to the user
    embed = discord.Embed(
        title=f"Spy Data Added for Player {player_id}",
        description=format_stats_for_display(player_id, spy_data, "high"),
        color=discord.Color.green()
    )
    await ctx.send(embed=embed)

@bot.command(name="help_spy")
async def help_spy(ctx):
    """Show help for spy-related commands"""
    embed = discord.Embed(
        title="BrotherOwl Spy Commands",
        description="Commands for tracking and estimating enemy battle stats",
        color=discord.Color.blue()
    )
    
    embed.add_field(
        name="!enemy_stats <player_id>",
        value="Look up saved spy data for a player",
        inline=False
    )
    
    embed.add_field(
        name="!enemy_stats <player_id> <damage> <turns> <my_primary_stat>",
        value="Estimate a player's stats based on battle performance",
        inline=False
    )
    
    embed.add_field(
        name="!add_spy <player_id> <str> <spd> <dex> <def>",
        value="Add or update spy data for a player",
        inline=False
    )
    
    embed.set_footer(text="BrotherOwl Spy System")
    await ctx.send(embed=embed)

def _get_color_for_confidence(confidence):
    """Return a color based on confidence level"""
    colors = {
        "high": discord.Color.green(),
        "medium": discord.Color.gold(),
        "low": discord.Color.orange(),
        "none": discord.Color.red()
    }
    return colors.get(confidence, discord.Color.default())

def main():
    """Main entry point for the bot"""
    try:
        if not TOKEN:
            logger.error("No Discord token found in environment variables.")
            print("Error: DISCORD_TOKEN environment variable not set.")
            return
        
        if not TORN_API_KEY:
            logger.warning("No Torn API key found in environment variables.")
            print("Warning: TORN_API_KEY environment variable not set.")
        
        bot.run(TOKEN)
    except Exception as e:
        logger.error(f"Error running bot: {e}")
        print(f"Error starting bot: {e}")

if __name__ == "__main__":
    main()
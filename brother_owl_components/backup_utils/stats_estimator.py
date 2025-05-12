"""
Stats Estimation Utility for BrotherOwlManager Bot

This utility provides functions to:
1. Load and save spy data to a JSON file
2. Estimate enemy battle stats based on damage and turns
3. Format stat data for display
"""

import json
import os
import math
from datetime import datetime

# File path for storing spy data
SPY_DATA_FILE = os.path.join('data', 'spies.json')

def ensure_spy_file_exists():
    """Ensure the spy data file exists, create if not"""
    os.makedirs(os.path.dirname(SPY_DATA_FILE), exist_ok=True)
    if not os.path.exists(SPY_DATA_FILE):
        with open(SPY_DATA_FILE, 'w') as f:
            json.dump({}, f)

def load_spy_data():
    """Load spy data from the JSON file"""
    ensure_spy_file_exists()
    try:
        with open(SPY_DATA_FILE, 'r') as f:
            return json.load(f)
    except json.JSONDecodeError:
        # If file is empty or corrupted, return empty dict
        return {}

def save_spy_data(spy_data):
    """Save spy data to the JSON file"""
    ensure_spy_file_exists()
    with open(SPY_DATA_FILE, 'w') as f:
        json.dump(spy_data, f, indent=2)

def add_spy_data(player_id, strength, speed, dexterity, defense):
    """Add spy data for a player"""
    spy_data = load_spy_data()
    
    # Add or update the player's stats
    spy_data[str(player_id)] = {
        "str": int(strength),
        "spd": int(speed),
        "dex": int(dexterity),
        "def": int(defense),
        "total": int(strength) + int(speed) + int(dexterity) + int(defense),
        "timestamp": datetime.now().isoformat()
    }
    
    save_spy_data(spy_data)
    return spy_data[str(player_id)]

def get_spy_data(player_id):
    """Get spy data for a player if it exists"""
    spy_data = load_spy_data()
    return spy_data.get(str(player_id))

def estimate_primary_stat(damage, turns, my_primary_stat):
    """
    Estimate enemy's primary stat using the basic formula:
    estimated_stat = (my_primary_stat * 1000) / (damage / turns)
    """
    if turns <= 0 or damage <= 0:
        return None
    
    # Basic formula based on damage per turn ratio
    damage_per_turn = damage / turns
    estimated_stat = (my_primary_stat * 1000) / damage_per_turn
    
    # Round to nearest thousand for readability
    return math.floor(estimated_stat / 1000) * 1000

def estimate_total_stats(primary_stat_estimate):
    """Estimate total stats based on primary stat"""
    if primary_stat_estimate is None:
        return None
    
    # Usually total stats are around 4x primary stat
    # This is a very rough estimate
    return primary_stat_estimate * 4

def get_stat_confidence(stat_data):
    """
    Calculate confidence level in the stat data
    Returns: high, medium, low
    """
    if not stat_data:
        return "none"
    
    # Check if it's from a spy (has all stats)
    if all(key in stat_data for key in ["str", "spd", "dex", "def", "timestamp"]):
        # Calculate days since the spy
        try:
            spy_date = datetime.fromisoformat(stat_data["timestamp"])
            days_since = (datetime.now() - spy_date).days
            
            if days_since < 7:
                return "high"
            elif days_since < 30:
                return "medium"
            else:
                return "low"
        except:
            return "medium"
    
    # If it's an estimate
    return "low"

def format_stats_for_display(player_id, stat_data, confidence="none"):
    """Format stat data for display in Discord embeds"""
    if not stat_data:
        return f"No data available for player {player_id}"
    
    # Format differently for spy data vs estimates
    if "str" in stat_data:
        # Full spy data
        return (
            f"**Strength:** {stat_data['str']:,}\n"
            f"**Speed:** {stat_data['spd']:,}\n"
            f"**Dexterity:** {stat_data['dex']:,}\n"
            f"**Defense:** {stat_data['def']:,}\n"
            f"**Total:** {stat_data['total']:,}\n"
            f"**Confidence:** {confidence.capitalize()}"
        )
    else:
        # Estimate
        return (
            f"**Estimated Primary:** {stat_data.get('primary', 0):,}\n"
            f"**Estimated Total:** {stat_data.get('total', 0):,}\n"
            f"**Confidence:** {confidence.capitalize()}"
        )

def get_recommendation(my_total_stats, enemy_total_stats):
    """
    Get a battle recommendation based on stat comparison
    Returns: safe, caution, avoid
    """
    if not enemy_total_stats or not my_total_stats:
        return "unknown"
    
    ratio = my_total_stats / enemy_total_stats
    
    if ratio > 1.5:
        return "safe"
    elif ratio > 0.8:
        return "caution"
    else:
        return "avoid"
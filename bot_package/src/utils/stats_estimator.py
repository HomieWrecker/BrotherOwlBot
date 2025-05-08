"""
Stats Estimator Module

This module provides functions for estimating player battle stats
based on battle performance, spy information, or other sources.
"""

import os
import json
import math
import time
from datetime import datetime

# Path to spies data file
SPIES_FILE = 'data/spies.json'

def load_spy_data():
    """Load spy data from storage"""
    if not os.path.exists(SPIES_FILE):
        os.makedirs(os.path.dirname(SPIES_FILE), exist_ok=True)
        with open(SPIES_FILE, 'w') as f:
            json.dump({}, f)
        return {}
    
    try:
        with open(SPIES_FILE, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}

def save_spy_data(spy_data):
    """Save spy data to storage"""
    os.makedirs(os.path.dirname(SPIES_FILE), exist_ok=True)
    with open(SPIES_FILE, 'w') as f:
        json.dump(spy_data, f, indent=2)

def get_spy_data(player_id):
    """Get spy data for a player if available"""
    all_spy_data = load_spy_data()
    return all_spy_data.get(str(player_id), None)

def add_spy_data(player_id, strength, speed, dexterity, defense):
    """Add spy data for a player"""
    all_spy_data = load_spy_data()
    
    # Calculate total stats
    total = strength + speed + dexterity + defense
    
    # Store the data
    all_spy_data[str(player_id)] = {
        "strength": strength,
        "speed": speed,
        "dexterity": dexterity,
        "defense": defense,
        "total": total,
        "timestamp": time.time(),
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    save_spy_data(all_spy_data)
    return all_spy_data[str(player_id)]

def estimate_primary_stat(damage, turns, opponent_primary):
    """
    Estimate a player's primary stat based on damage dealt
    
    damage: amount of damage dealt
    turns: number of turns used
    opponent_primary: your own primary stat value
    
    Returns: estimated primary stat value
    """
    # Basic formula derived from battle mechanics
    # This is a simplified version and may not be perfectly accurate
    damage_per_turn = damage / turns if turns > 0 else 0
    
    # Reverse-engineer the damage formula (simplified)
    # Estimate ratio with some adjustments
    ratio = (damage_per_turn / 240) ** 0.65
    estimated_primary = opponent_primary * ratio
    
    # Round to nearest thousand for a more realistic estimate
    return round(estimated_primary / 1000) * 1000

def estimate_total_stats(primary_stat, accuracy="low"):
    """
    Estimate total stats based on primary stat
    
    primary_stat: primary stat value (estimated or known)
    accuracy: accuracy level ("high", "medium", "low")
    
    Returns: estimated total stats
    """
    # Different multipliers based on accuracy level
    multipliers = {
        "high": 3.5,    # For high accuracy (spy info)
        "medium": 3.8,  # For medium accuracy
        "low": 4.2      # For low accuracy (rough estimate)
    }
    
    multiplier = multipliers.get(accuracy, multipliers["low"])
    return int(primary_stat * multiplier)

def get_stat_confidence(spy_data):
    """
    Determine confidence level of spy data based on age
    
    Returns: confidence level ("high", "medium", "low", "none")
    """
    if not spy_data or "timestamp" not in spy_data:
        return "none"
    
    # Calculate age in days
    age_in_seconds = time.time() - spy_data["timestamp"]
    age_in_days = age_in_seconds / (60 * 60 * 24)
    
    # Determine confidence level
    if age_in_days < 7:
        return "high"
    elif age_in_days < 30:
        return "medium"
    else:
        return "low"

def get_recommendation(your_stats, enemy_stats):
    """
    Provide a battle recommendation based on stats comparison
    
    Returns: recommendation string and confidence level
    """
    if not enemy_stats:
        return "No data available to make a recommendation", "none"
    
    your_total = your_stats.get("total", 0)
    enemy_total = enemy_stats.get("total", 0)
    
    if your_total == 0 or enemy_total == 0:
        return "Insufficient data for recommendation", "none"
    
    # Calculate ratio
    ratio = your_total / enemy_total
    confidence = get_stat_confidence(enemy_stats)
    
    # Determine recommendation
    if ratio > 1.5:
        return "Highly favorable - You significantly outmatch this opponent", confidence
    elif ratio > 1.1:
        return "Favorable - You have an advantage", confidence
    elif ratio > 0.9:
        return "Even match - Battle could go either way", confidence
    elif ratio > 0.7:
        return "Unfavorable - Opponent has an advantage", confidence
    else:
        return "Highly unfavorable - Opponent significantly outmatches you", confidence

def format_stats_for_display(player_id, stats, confidence):
    """Format stats for display in Discord"""
    if not stats:
        return f"No data available for player {player_id}"
    
    # Format for full spy data
    if all(k in stats for k in ["strength", "speed", "dexterity", "defense"]):
        timestamp_info = f"\nLast updated: {stats.get('date', 'Unknown')}" if "date" in stats else ""
        confidence_text = f"\nConfidence: {confidence.upper()}"
        
        return (
            f"**Strength:** {stats['strength']:,}\n"
            f"**Speed:** {stats['speed']:,}\n"
            f"**Dexterity:** {stats['dexterity']:,}\n"
            f"**Defense:** {stats['defense']:,}\n"
            f"**Total:** {stats['total']:,}"
            f"{timestamp_info}"
            f"{confidence_text}"
        )
    
    # Format for estimated data (primary + total)
    if "primary" in stats and "total" in stats:
        confidence_text = f"\nConfidence: {confidence.upper()}"
        
        return (
            f"**Estimated Primary:** {stats['primary']:,}\n"
            f"**Estimated Total:** {stats['total']:,}"
            f"{confidence_text}"
        )
    
    # Format for total only
    if "total" in stats:
        confidence_text = f"\nConfidence: {confidence.upper()}"
        
        return (
            f"**Estimated Total:** {stats['total']:,}"
            f"{confidence_text}"
        )
    
    return "Invalid stat format"
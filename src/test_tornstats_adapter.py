"""
Test script for the TornStats Adapter
"""

import asyncio
import os
import json
import sys
from utils.tornstats_adapter import TornStatsAdapter

async def test_adapter(player_ids):
    """Test the adapter with multiple player IDs"""
    api_key = os.environ.get('TORNSTATS_API_KEY')
    adapter = TornStatsAdapter(api_key)
    
    try:
        print("🔹 STARTING TORNSTATS ADAPTER TEST 🔹")
        
        results = {}
        for player_id in player_ids:
            print(f"\nTesting player ID: {player_id}")
            data = await adapter.get_player_data(player_id)
            
            if data:
                print(f"✅ Successfully retrieved data for player {player_id}")
                # Pretty print the first level of data
                print(json.dumps(data, indent=2))
                
                # Extract and print battle stats if available
                if 'spy' in data:
                    spy_data = data['spy']
                    print(f"Player: {spy_data.get('name', 'Unknown')}")
                    print(f"Level: {spy_data.get('level', 'Unknown')}")
                    print(f"Strength: {spy_data.get('strength', 0):,}")
                    print(f"Defense: {spy_data.get('defense', 0):,}")
                    print(f"Speed: {spy_data.get('speed', 0):,}")
                    print(f"Dexterity: {spy_data.get('dexterity', 0):,}")
                    print(f"Source: {spy_data.get('source', 'Unknown')}")
                
                results[player_id] = data
            else:
                print(f"❌ Failed to retrieve data for player {player_id}")
                results[player_id] = None
        
        print("\n🔹 TEST SUMMARY 🔹")
        print(f"Total players tested: {len(player_ids)}")
        print(f"Successful retrievals: {sum(1 for r in results.values() if r is not None)}")
        print(f"Failed retrievals: {sum(1 for r in results.values() if r is None)}")
        
        print("\n🔹 COMPLETED TORNSTATS ADAPTER TEST 🔹")
        return results
    
    finally:
        await adapter.close()

if __name__ == "__main__":
    # Use command line arguments or defaults
    player_ids = sys.argv[1:] if len(sys.argv) > 1 else ['1', '2', '4', '225742', '1468764']
    
    loop = asyncio.get_event_loop()
    loop.run_until_complete(test_adapter(player_ids))
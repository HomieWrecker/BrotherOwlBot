"""
Test script for the TornStats Adapter
"""

import asyncio
import os
import json
import sys
import logging
from utils.tornstats_adapter import TornStatsAdapter

# Set up logging for debugging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("test_script")

async def test_adapter(player_ids):
    """Test the adapter with multiple player IDs"""
    api_key = os.environ.get('TORNSTATS_API_KEY')
    
    print("🔹 DEBUG INFO 🔹")
    print(f"API Key exists: {bool(api_key)}")
    if api_key:
        masked_key = api_key[:4] + "..." + api_key[-4:] if len(api_key) > 8 else "***"
        print(f"API Key format: {masked_key}")
    print(f"Python version: {sys.version}")
    print("🔹 END DEBUG INFO 🔹")
    
    adapter = TornStatsAdapter(api_key)
    
    try:
        print("\n🔹 STARTING TORNSTATS ADAPTER TEST 🔹")
        
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
                
                # Try direct fetch for debugging
                print("\n🔹 DEBUGGING DIRECT HTTP REQUESTS 🔹")
                try:
                    import aiohttp
                    async with aiohttp.ClientSession() as session:
                        # Try first with direct /profiles/ path
                        url = f"https://www.tornstats.com/profiles/{player_id}"
                        print(f"Testing direct URL: {url}")
                        async with session.get(url) as response:
                            status = response.status
                            print(f"  Status code: {status}")
                            if status == 200:
                                print("  Success! This URL works")
                            else:
                                print(f"  Failed with status {status}")
                        
                        # Try with API endpoint
                        url = f"https://www.tornstats.com/api/v1/player/{player_id}"
                        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
                        print(f"Testing API URL: {url}")
                        print(f"  Headers: {headers}")
                        async with session.get(url, headers=headers) as response:
                            status = response.status
                            print(f"  Status code: {status}")
                            if status == 200:
                                print("  Success! This API endpoint works")
                                response_data = await response.text()
                                try:
                                    json_data = json.loads(response_data)
                                    print(f"  Response data: {json.dumps(json_data, indent=2)}")
                                except:
                                    print(f"  Response text: {response_data[:200]}...")
                            else:
                                print(f"  Failed with status {status}")
                                response_text = await response.text()
                                print(f"  Response: {response_text[:200]}...")
                        
                        # Try another known endpoint
                        url = f"https://www.tornstats.com"
                        print(f"Testing base URL: {url}")
                        async with session.get(url) as response:
                            status = response.status
                            print(f"  Status code: {status}")
                            if status == 200:
                                print("  Success! Base URL works")
                                html = await response.text()
                                print(f"  Title: {html.split('<title>')[1].split('</title>')[0] if '<title>' in html else 'No title found'}")
                            else:
                                print(f"  Failed with status {status}")
                except Exception as e:
                    print(f"  Error during direct testing: {str(e)}")
                
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
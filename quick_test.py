#!/usr/bin/env python
import os
import requests

# Get the API key from environment variable
api_key = os.environ.get("TORNSTATS_API_KEY")
print(f"API key present: {bool(api_key)}")

# Check if the key is valid
if api_key:
    # Mask the key for display
    masked_key = api_key[:4] + '...' + api_key[-4:] if len(api_key) > 8 else "Invalid format"
    print(f"API Key (masked): {masked_key}")
    
    # Try a simple API request
    url = f"https://www.tornstats.com/api/v1/{api_key}"
    try:
        print(f"\nTesting connection to TornStats...")
        response = requests.get(url, 
                              headers={
                                  'User-Agent': 'BrotherOwlManager/1.0',
                                  'Accept': 'application/json'
                              })
        print(f"Status code: {response.status_code}")
        
        if response.status_code == 200:
            print("Success! Your API key is working correctly.")
        else:
            print(f"API returned status {response.status_code}")
            print(f"Response: {response.text[:200]}...")
    except Exception as e:
        print(f"Error during API request: {str(e)}")
else:
    print("ERROR: No TornStats API key found in environment variables.")
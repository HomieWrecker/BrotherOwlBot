#!/usr/bin/env python
"""
TornStats API Key Validator

This script checks if your TornStats API key is valid
and determines the correct API format to use.

It tests multiple formats and API conventions to find
the working endpoint pattern.
"""

import os
import sys
import asyncio
import json
import requests
from bs4 import BeautifulSoup

# Basic settings
BASE_URL = "https://www.tornstats.com"
TEST_PLAYER_ID = "2"  # Known player ID for testing
API_KEY = os.environ.get("TORNSTATS_API_KEY")

print("🔹 TORNSTATS API KEY VALIDATOR 🔹")
print(f"API key present: {bool(API_KEY)}")
if not API_KEY:
    print("ERROR: TORNSTATS_API_KEY environment variable is not set")
    sys.exit(1)

# Mask the API key for display
masked_key = API_KEY[:4] + "..." + API_KEY[-4:] if API_KEY and len(API_KEY) > 8 else "Invalid key format"
print(f"API Key (masked): {masked_key}")

# Define different possible API formats to try
API_FORMATS = [
    # Format 1: Key in path (some APIs use this)
    {"url": f"{BASE_URL}/api/v1/{API_KEY}/spy/user/{TEST_PLAYER_ID}", "method": "GET", "headers": {}, "desc": "Key in path v1"},
    {"url": f"{BASE_URL}/api/v2/{API_KEY}/spy/{TEST_PLAYER_ID}", "method": "GET", "headers": {}, "desc": "Key in path v2"},
    
    # Format 2: Key as query parameter
    {"url": f"{BASE_URL}/api/v1/player/{TEST_PLAYER_ID}?key={API_KEY}", "method": "GET", "headers": {}, "desc": "Key as query param v1"},
    {"url": f"{BASE_URL}/api/v1/user/{TEST_PLAYER_ID}?key={API_KEY}", "method": "GET", "headers": {}, "desc": "Key as query param (user)"},
    {"url": f"{BASE_URL}/api/v1/spy/{TEST_PLAYER_ID}?key={API_KEY}", "method": "GET", "headers": {}, "desc": "Key as query param (spy)"},
    
    # Format 3: Key in header as Bearer token
    {"url": f"{BASE_URL}/api/v1/player/{TEST_PLAYER_ID}", "method": "GET", 
     "headers": {"Authorization": f"Bearer {API_KEY}"}, "desc": "Bearer token v1"},
    
    # Format 4: Key in header as X-API-Key (common)
    {"url": f"{BASE_URL}/api/v1/player/{TEST_PLAYER_ID}", "method": "GET", 
     "headers": {"X-API-Key": API_KEY}, "desc": "X-API-Key header"},
     
    # Format 5: Legacy API pattern (common in older APIs)
    {"url": f"{BASE_URL}/api.php?v=user&action=spy&id={TEST_PLAYER_ID}&key={API_KEY}", "method": "GET", "headers": {}, "desc": "Legacy API pattern"},
    {"url": f"{BASE_URL}/api/spy.php?id={TEST_PLAYER_ID}&key={API_KEY}", "method": "GET", "headers": {}, "desc": "Legacy spy API"},
    {"url": f"{BASE_URL}/api.php?action=spy&id={TEST_PLAYER_ID}&key={API_KEY}", "method": "GET", "headers": {}, "desc": "Legacy action API"}
]

# Try login-based approach
LOGIN_URLS = [
    {"url": f"{BASE_URL}/login.php", "params": {"key": API_KEY}, "desc": "Login with key param"},
    {"url": f"{BASE_URL}/login.php", "params": {"tornstats_api": API_KEY}, "desc": "Login with tornstats_api param"},
]

print("\n🔍 Testing API endpoints...")
working_formats = []

for fmt in API_FORMATS:
    print(f"\nTesting {fmt['desc']}")
    print(f"URL: {fmt['url']}")
    if fmt['headers']:
        print(f"Headers: {fmt['headers']}")
    
    try:
        # Add common headers for all requests
        headers = {
            "User-Agent": "BrotherOwlManager/1.0",
            "Accept": "application/json,text/html",
            "Referer": BASE_URL + "/"
        }
        headers.update(fmt['headers'])
        
        response = requests.get(fmt['url'], headers=headers, timeout=10)
        
        print(f"Status: {response.status_code}")
        
        # Check content type
        content_type = response.headers.get('Content-Type', '')
        is_json = 'json' in content_type.lower()
        is_html = 'html' in content_type.lower()
        
        print(f"Content-Type: {content_type}")
        
        # Try to parse as JSON first
        try:
            if response.status_code == 200:
                if is_json or (not is_html and response.text.strip().startswith('{')):
                    data = response.json()
                    print(f"JSON data found: {json.dumps(data)[:200]}...")
                    working_formats.append(fmt)
                else:
                    # Check if HTML contains embedded data
                    if is_html and ('stats' in response.text.lower() or 'strength' in response.text.lower()):
                        print(f"HTML with potential data: {response.text[:200]}...")
                        soup = BeautifulSoup(response.text, 'html.parser')
                        title = soup.find('title')
                        if title:
                            print(f"Page title: {title.text}")
                        working_formats.append(fmt)
        except json.JSONDecodeError:
            print("Response is not valid JSON")
            if response.status_code == 200:
                print(f"Response text: {response.text[:200]}...")
    except Exception as e:
        print(f"Error: {str(e)}")

print("\n🔍 Testing login-based access...")
working_logins = []

for login in LOGIN_URLS:
    print(f"\nTesting {login['desc']}")
    print(f"URL: {login['url']}")
    print(f"Params: {login['params']}")
    
    try:
        response = requests.get(login['url'], params=login['params'], allow_redirects=False, timeout=10)
        
        print(f"Status: {response.status_code}")
        
        # Check for redirect or cookies (signs of successful login)
        if response.status_code in (302, 303):
            print(f"Redirect location: {response.headers.get('Location')}")
            working_logins.append(login)
        elif response.status_code == 200:
            # Check if cookies were set
            cookies = response.cookies
            if cookies:
                print(f"Cookies received: {[c for c in cookies]}")
                working_logins.append(login)
                
                # Try accessing spy page with cookies
                print("\nTrying to access spy page with cookies...")
                spy_url = f"{BASE_URL}/spy.php?id={TEST_PLAYER_ID}"
                spy_response = requests.get(spy_url, cookies=cookies, timeout=10)
                print(f"Spy page status: {spy_response.status_code}")
                
                # Check if spy page has battle stats
                if spy_response.status_code == 200:
                    if 'battle stats' in spy_response.text.lower() or 'strength' in spy_response.text.lower():
                        print("Battle stats section found in spy page!")
                        
                        # Extract just a snippet
                        soup = BeautifulSoup(spy_response.text, 'html.parser')
                        title = soup.find('title')
                        if title:
                            print(f"Page title: {title.text}")
    except Exception as e:
        print(f"Error: {str(e)}")

print("\n🔹 VALIDATION SUMMARY 🔹")
print(f"Working API formats: {len(working_formats)}")
for i, fmt in enumerate(working_formats, 1):
    print(f"{i}. {fmt['desc']} - {fmt['url']}")

print(f"\nWorking login methods: {len(working_logins)}")
for i, login in enumerate(working_logins, 1):
    print(f"{i}. {login['desc']} - {login['url']} with {login['params']}")

print("\nRecommendations:")
if working_formats:
    print(f"✓ Use the '{working_formats[0]['desc']}' format for API access")
elif working_logins:
    print(f"✓ Use login-based approach with '{working_logins[0]['desc']}'")
else:
    print("✗ No working API access methods found.")
    print("Please check if your TornStats API key is valid.")
    print("You may need to log in to TornStats and get a new API key.")
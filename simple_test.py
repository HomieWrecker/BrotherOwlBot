import requests
import os

# Simple test script to check direct HTTP access to TornStats
api_key = os.environ.get('TORNSTATS_API_KEY')
player_id = "2"  # Ched's ID, a well-known Torn player

print("🔹 TESTING TORNSTATS ACCESS 🔹")
print(f"API key present: {bool(api_key)}")

# Test the base URL
print("\nTesting base URL")
response = requests.get("https://www.tornstats.com")
print(f"Base URL status: {response.status_code}")
print(f"Title: {response.text.split('<title>')[1].split('</title>')[0] if '<title>' in response.text else 'No title found'}")

# Test player profiles URL
print("\nTesting player profiles URL")
url = f"https://www.tornstats.com/profiles/{player_id}"
response = requests.get(url)
print(f"URL: {url}")
print(f"Status: {response.status_code}")

# Try alternative API endpoints
print("\nTesting alternative API endpoints")

# Try tornstats.co.uk (sometimes used as an alternative domain)
url = f"https://www.tornstats.co.uk/profiles/{player_id}"
try:
    response = requests.get(url, timeout=5)
    print(f"Alternate domain URL: {url}")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:200]}...")
except Exception as e:
    print(f"Error with alternate domain: {str(e)}")

# Try some more modern endpoints
url = f"https://www.tornstats.com/api/spy/{player_id}"
headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
response = requests.get(url, headers=headers)
print(f"\nModern API URL: {url}")
print(f"Status: {response.status_code}")
print(f"Response: {response.text[:200]}...")

# Check if API is documented somewhere
url = "https://www.tornstats.com/api"
response = requests.get(url)
print(f"\nAPI documentation URL: {url}")
print(f"Status: {response.status_code}")
print(f"Title: {response.text.split('<title>')[1].split('</title>')[0] if '<title>' in response.text else 'No title found'}")

# Try a different common endpoint format
url = f"https://api.tornstats.com/v1/spy/{player_id}"
headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
try:
    response = requests.get(url, headers=headers, timeout=5)
    print(f"\nAPI subdomain URL: {url}")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:200]}...")
except Exception as e:
    print(f"Error with API subdomain: {str(e)}")

# Try a very common API pattern
url = f"https://www.tornstats.com/api.php?action=spy&id={player_id}&key={api_key}"
response = requests.get(url)
print(f"\nCommon API pattern: {url}")
print(f"Status: {response.status_code}")
print(f"Response: {response.text[:200]}...")

# Try the server status endpoint (common in APIs)
url = "https://www.tornstats.com/api/status"
response = requests.get(url)
print(f"\nStatus endpoint: {url}")
print(f"Status: {response.status_code}")
print(f"Response: {response.text[:200]}...")

print("\n🔹 TESTING COMPLETE 🔹")
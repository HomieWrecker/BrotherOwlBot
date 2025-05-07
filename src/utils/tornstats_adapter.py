"""
TornStats Adapter for BrotherOwlManager

A robust adapter for fetching data from TornStats with multiple fallback methods
and resilient error handling.
"""

import aiohttp
from bs4 import BeautifulSoup
import json
import logging
import os
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tornstats_adapter")

class TornStatsAdapter:
    def __init__(self, api_key=None):
        """Initialize the TornStats adapter with an optional API key"""
        self.api_key = api_key or os.environ.get('TORNSTATS_API_KEY')
        self.base_url = "https://www.tornstats.com"
        self.api_base = f"{self.base_url}/api"
        self.session = None
        self.cache = {}
        self.cache_expiry = 3600  # Cache expires after 1 hour

    async def ensure_session(self):
        """Ensure an active aiohttp session exists"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(headers={
                'User-Agent': 'BrotherOwlManager/1.0',
                'Accept': 'application/json, text/html',
                'Referer': 'https://www.tornstats.com/'
            })
        return self.session
    
    async def get_player_data(self, player_id):
        """Unified data fetcher with error handling and caching"""
        # Check cache first
        cache_key = f"player_{player_id}"
        cached_data = self.get_from_cache(cache_key)
        if cached_data:
            logger.info(f"Using cached data for player {player_id}")
            return cached_data
        
        try:
            await self.ensure_session()
            
            # Try JSON API first with multiple formats
            logger.info(f"Trying JSON API for player {player_id}")
            json_data = await self._fetch_json_api(player_id)
            if json_data:
                self.cache[cache_key] = {
                    'data': json_data,
                    'timestamp': asyncio.get_event_loop().time()
                }
                return json_data

            # Try HTML parsing fallback
            logger.info(f"Trying HTML parsing for player {player_id}")
            html_data = await self._parse_html_profile(player_id)
            if html_data:
                self.cache[cache_key] = {
                    'data': html_data,
                    'timestamp': asyncio.get_event_loop().time()
                }
                return html_data

            # Try authenticated access methods
            logger.info(f"Trying authenticated access for player {player_id}")
            auth_data = await self._try_authenticated_access(player_id)
            if auth_data:
                self.cache[cache_key] = {
                    'data': auth_data,
                    'timestamp': asyncio.get_event_loop().time()
                }
                return auth_data

            logger.warning(f"Could not retrieve data for player {player_id}")
            return None

        except Exception as e:
            logger.error(f"TornStats error for {player_id}: {str(e)}")
            return None

    async def _fetch_json_api(self, player_id):
        """Attempt direct JSON API access with official endpoint formats"""
        if not self.api_key:
            logger.warning("No API key provided for TornStats")
            return None
        
        # Use the official TornStats API endpoints
        endpoints = [
            # Player basic endpoint
            f"https://www.tornstats.com/api/v1/player/{player_id}",
            # Player full endpoint (more detailed)
            f"https://www.tornstats.com/api/v1/player/{player_id}/full",
            # Battle stats endpoint
            f"https://www.tornstats.com/api/v1/battles/{player_id}",
        ]
        
        for endpoint in endpoints:
            logger.info(f"Trying endpoint: {endpoint}")
            try:
                headers = {
                    'User-Agent': 'BrotherOwlManager/1.0',
                    'Accept': 'application/json',
                    'Referer': 'https://www.tornstats.com/',
                    'Authorization': f'Bearer {self.api_key}'
                }
                
                async with self.session.get(
                    endpoint,
                    headers=headers,
                    timeout=5
                ) as response:
                    if response.status == 200:
                        try:
                            data = await response.json(content_type=None)
                            if data:
                                logger.info(f"Successfully retrieved JSON data from {endpoint}")
                                return self._normalize_tornstats_data(data)
                        except json.JSONDecodeError:
                            logger.warning(f"Endpoint {endpoint} returned non-JSON response")
                            continue
            except Exception as e:
                logger.warning(f"Error accessing {endpoint}: {str(e)}")
                continue
                
        # If Bearer token didn't work, try API key as parameter
        for endpoint in endpoints:
            logger.info(f"Trying endpoint with API key as parameter: {endpoint}")
            try:
                endpoint_with_key = f"{endpoint}?key={self.api_key}"
                async with self.session.get(
                    endpoint_with_key,
                    timeout=5
                ) as response:
                    if response.status == 200:
                        try:
                            data = await response.json(content_type=None)
                            if data:
                                logger.info(f"Successfully retrieved JSON data from {endpoint_with_key}")
                                return self._normalize_tornstats_data(data)
                        except json.JSONDecodeError:
                            logger.warning(f"Endpoint {endpoint_with_key} returned non-JSON response")
                            continue
            except Exception as e:
                logger.warning(f"Error accessing {endpoint_with_key}: {str(e)}")
                continue
                
        return None

    async def _parse_html_profile(self, player_id):
        """Robust HTML fallback parser for TornStats profiles"""
        urls = [
            # Official HTML profile URL
            f"https://www.tornstats.com/profiles/{player_id}",
            # Fallback URLs in case the official one changes
            f"{self.base_url}/player.php?id={player_id}",
            f"{self.base_url}/profiles.php?XID={player_id}",
            f"{self.base_url}/spy.php?id={player_id}"
        ]
        
        for url in urls:
            try:
                logger.info(f"Trying to parse HTML from: {url}")
                async with self.session.get(
                    url,
                    headers={
                        'User-Agent': 'BrotherOwlManager/1.0',
                        'Accept': 'text/html',
                        'Referer': 'https://www.tornstats.com/'
                    },
                    timeout=10
                ) as response:
                    if response.status != 200:
                        logger.warning(f"HTTP {response.status} from {url}")
                        continue

                    html = await response.text()
                    soup = BeautifulSoup(html, 'html.parser')

                    # Look for battle stats in various formats
                    data = {}
                    
                    # Method 1: Look for specific divs/tables with stat info
                    stats_div = soup.find('div', class_='player-stats') or soup.find('div', class_='statsList')
                    if stats_div:
                        data = self._extract_stats_from_div(stats_div)
                    
                    # Method 2: Look for table cells with stat info
                    if not data or sum(data.values()) == 0:
                        tables = soup.find_all('table')
                        for table in tables:
                            cells = table.find_all('td')
                            for i, cell in enumerate(cells):
                                if cell.text.strip().lower() in ['strength', 'speed', 'dexterity', 'defense']:
                                    stat_name = cell.text.strip().lower()
                                    if i+1 < len(cells) and cells[i+1].text.strip():
                                        try:
                                            data[stat_name] = int(cells[i+1].text.strip().replace(',', ''))
                                        except ValueError:
                                            pass
                    
                    # Method 3: Look for specific text patterns
                    if not data or sum(data.values()) == 0:
                        for stat in ['strength', 'speed', 'dexterity', 'defense']:
                            pattern = f"{stat.capitalize()}:"
                            elements = soup.find_all(text=lambda t: pattern in t)
                            for element in elements:
                                text = element.strip()
                                try:
                                    value = text.split(pattern)[1].strip().split()[0].replace(',', '')
                                    data[stat] = int(value)
                                except (IndexError, ValueError):
                                    pass
                    
                    # Extract name and level
                    name = None
                    level = 0
                    
                    # Look for name in title
                    title_tag = soup.find('title')
                    if title_tag:
                        title = title_tag.text
                        if ' - ' in title:
                            name = title.split(' - ')[0].strip()
                    
                    # Look for level
                    level_elements = soup.find_all(text=lambda t: 'Level:' in t or 'Level' in t)
                    for element in level_elements:
                        try:
                            level_text = element.strip()
                            level_value = ''.join(filter(str.isdigit, level_text))
                            if level_value:
                                level = int(level_value)
                                break
                        except:
                            pass
                    
                    # Check if we found any stats
                    if data and sum(data.values()) > 0:
                        logger.info(f"Successfully extracted stats from HTML: {data}")
                        
                        # Format response like API would
                        result = {
                            'spy': {
                                'name': name or f"Player {player_id}",
                                'level': level or 0,
                                'strength': data.get('strength', 0),
                                'defense': data.get('defense', 0),
                                'speed': data.get('speed', 0),
                                'dexterity': data.get('dexterity', 0),
                                'update_time': 'HTML Extraction',
                                'source': 'HTML'
                            }
                        }
                        return result
                        
            except Exception as e:
                logger.warning(f"HTML parse failed for {url}: {str(e)}")
                continue
                
        return None

    def _extract_stats_from_div(self, div):
        """Helper method to extract stats from a div"""
        stats = {
            'strength': 0,
            'defense': 0,
            'speed': 0,
            'dexterity': 0
        }
        
        # Method 1: Look for elements with specific class names
        for stat in stats.keys():
            elem = div.find(class_=f'stat-{stat}') or div.find(class_=stat)
            if elem:
                try:
                    stats[stat] = int(elem.text.strip().replace(',', ''))
                except ValueError:
                    pass
        
        # Method 2: Look for specific text
        if sum(stats.values()) == 0:
            for stat in stats.keys():
                elements = div.find_all(text=lambda t: f"{stat.capitalize()}:" in t)
                for element in elements:
                    try:
                        text = element.strip()
                        value = text.split(f"{stat.capitalize()}:")[1].strip().split()[0].replace(',', '')
                        stats[stat] = int(value)
                    except (IndexError, ValueError):
                        pass
        
        return stats

    async def _try_authenticated_access(self, player_id):
        """Attempt to access data with authentication flow"""
        if not self.api_key:
            return None
            
        try:
            # Step 1: Try to "login" with API key
            login_url = f"{self.base_url}/login.php"
            async with self.session.get(
                login_url,
                params={'tornstats_api': self.api_key},
                allow_redirects=False,
                timeout=10
            ) as login_response:
                # Check for cookies
                cookies = login_response.cookies
                
                # Step 2: Try to access spy page with cookies
                spy_url = f"{self.base_url}/spy.php?id={player_id}"
                async with self.session.get(
                    spy_url,
                    cookies=cookies,
                    timeout=10
                ) as spy_response:
                    if spy_response.status == 200:
                        html = await spy_response.text()
                        # Try to extract JSON data first (might be embedded)
                        json_data = self._extract_json_from_html(html)
                        if json_data:
                            return json_data
                            
                        # If no JSON, parse the HTML
                        soup = BeautifulSoup(html, 'html.parser')
                        return self._parse_tornstats_spy_html(soup, player_id)
                        
        except Exception as e:
            logger.error(f"Authentication flow failed: {str(e)}")
            
        return None

    def _extract_json_from_html(self, html):
        """Try to extract JSON data embedded in HTML"""
        try:
            # Look for JSON in script tags
            start_marker = 'var playerData = '
            if start_marker in html:
                json_start = html.index(start_marker) + len(start_marker)
                json_end = html.index(';', json_start)
                json_str = html[json_start:json_end].strip()
                data = json.loads(json_str)
                return self._normalize_tornstats_data(data)
        except Exception as e:
            logger.warning(f"Failed to extract JSON from HTML: {str(e)}")
        return None

    def _parse_tornstats_spy_html(self, soup, player_id):
        """Parse TornStats spy page HTML"""
        data = {}
        
        # Find the main stats container
        stats_container = soup.find('div', class_='playerStats') or soup.find('div', class_='spy-stats')
        
        if not stats_container:
            return None
            
        # Extract stats
        stats = self._extract_stats_from_div(stats_container)
        
        # Extract name and level
        name_elem = soup.find('h1') or soup.find('h2', class_='playerName')
        name = name_elem.text.strip() if name_elem else f"Player {player_id}"
        
        level_elem = soup.find(text=lambda t: 'Level:' in t)
        level = 0
        if level_elem:
            try:
                level_text = level_elem.strip()
                level = int(''.join(filter(str.isdigit, level_text)))
            except:
                pass
                
        # Format response
        return {
            'spy': {
                'name': name,
                'level': level,
                'strength': stats.get('strength', 0),
                'defense': stats.get('defense', 0),
                'speed': stats.get('speed', 0),
                'dexterity': stats.get('dexterity', 0),
                'update_time': 'HTML Extraction',
                'source': 'HTML Spy'
            }
        }

    def _normalize_tornstats_data(self, data):
        """Normalize TornStats data from different formats"""
        # First, identify the format
        if 'spy' in data:
            # Already in spy format
            return data
            
        if 'user' in data:
            # User format
            user_data = data['user']
            return {
                'spy': {
                    'name': user_data.get('name', 'Unknown'),
                    'level': user_data.get('level', 0),
                    'strength': user_data.get('strength', 0),
                    'defense': user_data.get('defense', 0),
                    'speed': user_data.get('speed', 0),
                    'dexterity': user_data.get('dexterity', 0),
                    'update_time': user_data.get('update_time', 'Unknown'),
                    'source': 'TornStats API'
                }
            }
            
        if 'status' in data and data['status'] == 'ok' and 'stats' in data:
            # Stats format
            stats_data = data['stats']
            return {
                'spy': {
                    'name': stats_data.get('name', 'Unknown'),
                    'level': stats_data.get('level', 0),
                    'strength': stats_data.get('strength', 0),
                    'defense': stats_data.get('defense', 0),
                    'speed': stats_data.get('speed', 0),
                    'dexterity': stats_data.get('dexterity', 0),
                    'update_time': stats_data.get('update_time', 'Unknown'),
                    'source': 'TornStats API'
                }
            }
            
        # Unknown format, try to adapt
        if isinstance(data, dict):
            # Check if the data directly contains stats fields
            if all(key in data for key in ['strength', 'defense', 'speed', 'dexterity']):
                return {
                    'spy': {
                        'name': data.get('name', 'Unknown'),
                        'level': data.get('level', 0),
                        'strength': data.get('strength', 0),
                        'defense': data.get('defense', 0),
                        'speed': data.get('speed', 0),
                        'dexterity': data.get('dexterity', 0),
                        'update_time': data.get('update_time', 'Unknown'),
                        'source': 'TornStats API'
                    }
                }
        
        # If we can't normalize it, return as is
        return data

    def get_from_cache(self, key):
        """Get data from cache if it exists and is not expired"""
        if key in self.cache:
            entry = self.cache[key]
            now = asyncio.get_event_loop().time()
            if now - entry['timestamp'] < self.cache_expiry:
                return entry['data']
            else:
                # Cache expired
                del self.cache[key]
        return None

    async def close(self):
        """Close the aiohttp session"""
        if self.session and not self.session.closed:
            await self.session.close()


# Helper function to create an adapter instance
def create_adapter(api_key=None):
    """Create a new TornStats adapter instance"""
    return TornStatsAdapter(api_key)


# Test function for direct usage
async def test_adapter(player_id, api_key=None):
    """Test the adapter with a player ID"""
    adapter = create_adapter(api_key)
    try:
        data = await adapter.get_player_data(player_id)
        print(f"Data for player {player_id}:")
        print(json.dumps(data, indent=2))
        return data
    finally:
        await adapter.close()


# If run directly, execute the test
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python tornstats_adapter.py <player_id> [api_key]")
        sys.exit(1)
        
    player_id = sys.argv[1]
    api_key = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('TORNSTATS_API_KEY')
    
    loop = asyncio.get_event_loop()
    loop.run_until_complete(test_adapter(player_id, api_key))
import requests
import sys

BASE_URL = "http://localhost:3001/api/v1"

def get_first_satellite_id():
    try:
        response = requests.get(f"{BASE_URL}/satellites/?limit=1")
        if response.status_code == 200:
            data = response.json()
            if len(data) > 0:
                print(f"Found satellite: {data[0]['name']} (NORAD: {data[0]['norad_id']})")
                return data[0]['norad_id']
    except Exception as e:
        print(f"Error fetching satellites: {e}")
    return 25544 # Default to ISS

def test_orbit_endpoint(norad_id):
    url = f"{BASE_URL}/satellites/{norad_id}/orbit"
    try:
        print(f"Testing endpoint: {url}")
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            print(f"Success! Received {len(data)} points.")
            if len(data) > 0:
                print("First point:", data[0])
        else:
            print(f"Failed with status {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    sat_id = get_first_satellite_id()
    test_orbit_endpoint(sat_id)

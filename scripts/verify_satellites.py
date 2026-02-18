import httpx
import time
import sys
import subprocess
import os

BASE_URL = "http://127.0.0.1:8000/api/v1/satellites"

def check_backend():
    try:
        r = httpx.get("http://127.0.0.1:8000/health", timeout=2)
        return r.status_code == 200
    except:
        return False

def start_backend():
    print("Starting temporary backend...")
    p = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
                         cwd=os.path.join(os.getcwd(), "backend"),
                         stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE)
    for i in range(20):
        if check_backend():
            print("Backend started.")
            return p
        time.sleep(1)
    print("Backend failed to start.")
    return None

def verify_satellites():
    try:
        # 1. Test Listing with Pagination
        print(f"Testing Satellite Listing (limit=5)...")
        r = httpx.get(f"{BASE_URL}/?limit=5", timeout=10)
        if r.status_code != 200:
            print(f"[FAIL] Listing failed: {r.status_code}")
            return
        
        data = r.json()
        print(f"[PASS] Retrieved {len(data)} satellites.")
        if len(data) > 0:
            sample_sat = data[0]
            print(f"  Sample: {sample_sat['name']} (NORAD {sample_sat['norad_id']})")
            
            # 2. Test Single Satellite Detail
            norad_id = sample_sat['norad_id']
            print(f"\nTesting Satellite Detail (NORAD {norad_id})...")
            r_detail = httpx.get(f"{BASE_URL}/{norad_id}", timeout=10)
            if r_detail.status_code == 200:
                print(f"[PASS] Detail retrieval successful.")
                print(f"  Name: {r_detail.json()['name']}")
                print(f"  Object Type: {r_detail.json().get('object_type', 'N/A')}")
            else:
                print(f"[FAIL] Detail retrieval failed: {r_detail.status_code}")

            # 3. Test TLE Retrieval
            print(f"\nTesting TLE Retrieval (NORAD {norad_id})...")
            r_tle = httpx.get(f"{BASE_URL}/{norad_id}/tle", timeout=10)
            if r_tle.status_code == 200:
                tle_data = r_tle.json()
                print(f"[PASS] TLE retrieval successful.")
                print(f"  Epoch: {tle_data['epoch']}")
                print(f"  Source: {tle_data.get('source', 'N/A')}")
            else:
                print(f"[FAIL] TLE retrieval failed: {r_tle.status_code}")

        # 4. Test Search Functionality
        search_term = "ISS"
        print(f"\nTesting Search (q='{search_term}')...")
        r_search = httpx.get(f"{BASE_URL}/?q={search_term}", timeout=10)
        if r_search.status_code == 200:
            results = r_search.json()
            print(f"[PASS] Search returned {len(results)} results.")
            if len(results) > 0:
                print(f"  First result: {results[0]['name']}")
        else:
            print(f"[FAIL] Search failed: {r_search.status_code}")
        
    except Exception as e:
        print(f"Test failed with exception: {e}")

if __name__ == "__main__":
    server_process = None
    if not check_backend():
        server_process = start_backend()
    
    if check_backend():
        verify_satellites()
    else:
        print("Could not connect to backend.")

    if server_process:
        print("Stopping temporary backend...")
        server_process.terminate()

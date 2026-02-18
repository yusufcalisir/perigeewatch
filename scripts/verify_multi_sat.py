import httpx
import time
import sys
import subprocess
import os

URL = "http://127.0.0.1:8000/api/v1/positions/all"

def check_backend():
    try:
        r = httpx.get("http://127.0.0.1:8000/health", timeout=2)
        return r.status_code == 200
    except:
        return False

def start_backend():
    print("Starting temporary backend...")
    # Start in background
    p = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
                         cwd=os.path.join(os.getcwd(), "backend"),
                         stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE)
    # Wait for it to be ready
    for i in range(20):
        if check_backend():
            print("Backend started.")
            return p
        time.sleep(1)
    print("Backend failed to start.")
    return None

def verify_multi_sat():
    try:
        limit = 50
        print(f"Requesting positions for {limit} satellites...")
        start_time = time.time()
        r = httpx.get(f"{URL}?limit={limit}", timeout=10)
        duration = time.time() - start_time
        
        if r.status_code != 200:
            print(f"Failed: Status {r.status_code}")
            print(r.text)
            return

        data = r.json()
        count = len(data)
        print(f"Success! Received {count} records in {duration:.2f}s")
        
        if count > 0:
            sample = data[0]
            print(f"Sample Satellite (NORAD {sample.get('norad_id')}):")
            print(f"  Lat: {sample.get('lat')}")
            print(f"  Lon: {sample.get('lon')}")
            print(f"  Alt: {sample.get('alt')}")
            print(f"  Vel: {sample.get('velocity')}")
        else:
            print("Warning: Received empty list (no TLEs in DB?)")

    except Exception as e:
        print(f"Test failed with exception: {e}")

if __name__ == "__main__":
    server_process = None
    if not check_backend():
        server_process = start_backend()
    
    if check_backend():
        verify_multi_sat()
    else:
        print("Could not connect to backend.")

    if server_process:
        print("Stopping temporary backend...")
        server_process.terminate()

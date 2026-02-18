import httpx
import time
import sys
import subprocess
import os

URL = "http://127.0.0.1:8000/api/v1/conjunctions/"

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

def verify_conjunctions():
    try:
        # Standard screening threshold
        threshold = 1000 # km
        limit = 100 # limit satellites to avoid timeout on compute
        print(f"Requesting conjunction analysis (threshold={threshold}km, limit={limit})...")
        
        start_time = time.time()
        r = httpx.get(f"{URL}?threshold_km={threshold}&limit={limit}", timeout=30)
        duration = time.time() - start_time
        
        if r.status_code != 200:
            print(f"Failed: Status {r.status_code}")
            print(r.text)
            return

        data = r.json()
        count = len(data)
        print(f"Success! Found {count} conjunction events in {duration:.2f}s")
        
        if count > 0:
            event = data[0]
            print(f"\nSample Event:")
            print(f"  Objects: {event['sat1_name']} <--> {event['sat2_name']}")
            print(f"  Time (TCA): {event['timestamp']}")
            print(f"  Distance: {event['distance']} km")
            print(f"  Risk Level: {event.get('risk_level', 'N/A')}")
            
            # Verify sorting (Risk List logic)
            distances = [e['distance'] for e in data]
            if distances == sorted(distances):
                print("\n[PASS] Output is correctly sorted as a PRIORITY RISK LIST (Closest/Riskiest first).")
            else:
                print("\n[FAIL] Output is NOT sorted by risk.")
        else:
            print("No conjunctions found (try increasing threshold).")

    except Exception as e:
        print(f"Test failed with exception: {e}")

def get_risk_str(dist):
    if dist < 1: return "CRITICAL"
    if dist < 5: return "HIGH"
    if dist < 25: return "MODERATE"
    return "LOW"

if __name__ == "__main__":
    server_process = None
    if not check_backend():
        server_process = start_backend()
    
    if check_backend():
        verify_conjunctions()
    else:
        print("Could not connect to backend.")

    if server_process:
        print("Stopping temporary backend...")
        server_process.terminate()

import asyncio
import websockets
import json
import sys
import subprocess
import os
import time
import httpx

WS_URL = "ws://127.0.0.1:8000/ws/positions"
HTTP_URL = "http://127.0.0.1:8000/health"

def check_backend():
    try:
        r = httpx.get(HTTP_URL, timeout=2)
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

async def test_websocket():
    print(f"Connecting to {WS_URL}...")
    try:
        async with websockets.connect(WS_URL) as websocket:
            print("Connected!")
            
            # Send config to limit output for test
            config = {"interval": 1, "limit": 5}
            await websocket.send(json.dumps(config))
            print(f"Sent config: {config}")

            # Listen for a few messages
            for i in range(3):
                message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                data = json.loads(message)
                
                print(f"\nReceived Message #{i+1}:")
                print(f"  Type: {data.get('type')}")
                print(f"  Timestamp: {data.get('timestamp')}")
                print(f"  Count: {data.get('count')}")
                
                if data.get('data'):
                    sample = data['data'][0]
                    print(f"  Sample Sat (NORAD {sample.get('norad_id')}):")
                    print(f"    Lat: {sample.get('lat'):.4f}")
                    print(f"    Lon: {sample.get('lon'):.4f}")
            
            print("\nWebSocket test PASSED.")
            
    except Exception as e:
        print(f"\nWebSocket test FAILED: {e}")

if __name__ == "__main__":
    server_process = None
    if not check_backend():
        server_process = start_backend()
    
    if check_backend():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(test_websocket())
    else:
        print("Could not connect to backend.")

    if server_process:
        print("Stopping temporary backend...")
        server_process.terminate()

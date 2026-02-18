import sys
import os
sys.path.append(os.getcwd())

from app.services.propagation import get_position_at
from datetime import datetime

# Sample TLE for ISS (ZARYA)
# Epoch: 2023-10-01 12:00:00 (approx)
name = "ISS (ZARYA)"
line1 = "1 25544U 98067A   23274.50000000  .00012345  00000-0  23456-3 0  9993"
line2 = "2 25544  51.6418   0.1234 0005678  10.0000 350.0000 15.50000000345678"

# Current time
now = datetime.utcnow()

print(f"Propagating {name} at {now} UTC...")

try:
    pos = get_position_at(line1, line2, now)
    
    if "error" in pos:
        print(f"Error: {pos['error']}")
    else:
        print("\nCalculation Successful:")
        print(f"Latitude:  {pos['lat']:.4f} deg")
        print(f"Longitude: {pos['lon']:.4f} deg")
        print(f"Altitude:  {pos['alt']:.4f} km")
        print(f"Velocity:  {pos['velocity']:.4f} km/s")
        print(f"GECI X:    {pos['pos_eci'][0]:.2f} km")
        print(f"GECI Y:    {pos['pos_eci'][1]:.2f} km")
        print(f"GECI Z:    {pos['pos_eci'][2]:.2f} km")

except Exception as e:
    print(f"Exception during propagation: {e}")

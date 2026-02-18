import sys
import os

# Add backend directory to sys.path to import app modules
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.conjunction import get_risk_level

def test_risk_thresholds():
    test_cases = [
        (0.5, "CRITICAL"),
        (0.999, "CRITICAL"),
        (1.0, "HIGH"),  # Implementation treats < 1 as Critical, so 1 is High
        (4.999, "HIGH"),
        (5.0, "MODERATE"),
        (24.999, "MODERATE"),
        (25.0, "LOW"),
        (100.0, "LOW")
    ]
    
    print("Testing Risk Thresholds:\n")
    all_passed = True
    
    for dist, expected in test_cases:
        result = get_risk_level(dist)
        status = "PASSED" if result == expected else "FAILED"
        if status == "FAILED":
            all_passed = False
        print(f"Distance: {dist:7.3f} km -> Expected: {expected:8} | Got: {result:8} [{status}]")

    if all_passed:
        print("\nAll threshold checks PASSED.")
    else:
        print("\nSome checks FAILED.")

if __name__ == "__main__":
    test_risk_thresholds()

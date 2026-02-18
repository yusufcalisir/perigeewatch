import sys
import os
sys.path.append(os.getcwd())
try:
    from app.worker import update_positions_task
except ImportError:
    # If running from backend root
    sys.path.append(os.path.join(os.getcwd(), '..'))
    from app.worker import update_positions_task

if __name__ == "__main__":
    print("Triggering propagation task...")
    try:
        # We can call the function directly (synchronously) since @task decorates it
        # but calling task() directly executes logic without broker.
        res = update_positions_task()
        print(f"Result: {res}")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

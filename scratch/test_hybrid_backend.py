import sys
import os

# Set backend path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.append(backend_path)

try:
    print("Attempting to import pipeline.py...")
    import pipeline
    print("SUCCESS: pipeline.py imported successfully!")
    
    print("Checking for banned packages (librosa, scipy)...")
    if "librosa" in sys.modules:
        print("ERROR: librosa is imported in pipeline!")
    else:
        print("OK: librosa is NOT imported.")
        
    if "scipy" in sys.modules:
        print("ERROR: scipy is imported in pipeline!")
    else:
        print("OK: scipy is NOT imported.")
        
    print("Checking snap_to_valley logic...")
    valleys = [{"time_sec": 184.2}, {"time_sec": 409.8}]
    snapped1 = pipeline._snap_to_valley(185.0, valleys)
    snapped2 = pipeline._snap_to_valley(300.0, valleys)
    print(f"Snap 185.0 -> {snapped1} (Expected 184.2)")
    print(f"Snap 300.0 -> {snapped2} (Expected 300.0)")
    if snapped1 == 184.2 and snapped2 == 300.0:
        print("OK: Snapping works correctly.")
    else:
        print("ERROR: Snapping logic failed.")

except Exception as e:
    print(f"FAIL: Verification failed with error: {e}")

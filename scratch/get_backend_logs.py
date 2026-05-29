import urllib.request
import json

api_key = "rnd_CVnhWdXQmtrUh0gAxvUSspgWItQs"
service_id = "srv-d8cl9k99rddc73dcr2u0"

# Note: Render logs can be queried from the deployment or service endpoint. 
# Render API has an endpoint: GET /v1/services/{serviceId}/logs
url = f"https://api.render.com/v1/services/{service_id}/logs"
req = urllib.request.Request(
    url,
    headers={
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
)

try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        print("Latest backend logs:")
        print(json.dumps(data, indent=2))
except Exception as e:
    # If the direct logs endpoint is not standard or restricted, let's print error
    print(f"Error fetching logs directly: {e}")

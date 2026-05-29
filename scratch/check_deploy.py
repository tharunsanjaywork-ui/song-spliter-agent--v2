import urllib.request
import json
import os

api_key = "rnd_CVnhWdXQmtrUh0gAxvUSspgWItQs"
service_id = "srv-d8cl9r4p3tds73dukm2g"

url = f"https://api.render.com/v1/services/{service_id}/deploys"
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
        if data:
            latest_deploy = data[0]['deploy']
            print(f"Deploy ID: {latest_deploy['id']}")
            print(f"Status: {latest_deploy['status']}")
            print(f"Created At: {latest_deploy['createdAt']}")
            print(f"Updated At: {latest_deploy['updatedAt']}")
        else:
            print("No deploys found.")
except Exception as e:
    print(f"Error querying Render API: {e}")

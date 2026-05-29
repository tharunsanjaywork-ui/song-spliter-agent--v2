import urllib.request
import json

api_key = "rnd_CVnhWdXQmtrUh0gAxvUSspgWItQs"
services = {
    "Frontend": "srv-d8cl9r4p3tds73dukm2g",
    "Backend": "srv-d8cl9k99rddc73dcr2u0"
}

for name, service_id in services.items():
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
                print(f"[{name}] Deploy ID: {latest_deploy['id']}")
                print(f"[{name}] Status: {latest_deploy['status']}")
                print(f"[{name}] Updated At: {latest_deploy['updatedAt']}")
            else:
                print(f"[{name}] No deploys found.")
    except Exception as e:
        print(f"[{name}] Error querying Render API: {e}")

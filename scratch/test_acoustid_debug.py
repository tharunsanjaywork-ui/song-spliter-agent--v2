import urllib.request
import urllib.parse
import json

CLIENT_API_KEY = "FNXfrDqZeY"
url = "https://api.acoustid.org/v2/lookup"
meta_flags = "recordings+recordingids+releases+releaseids+releasegroups+releasegroupids+tracks+usermeta+sources"

track_ids = [
    "b4dc47ee-ebc2-4313-8331-1924a154ad2c",
    "95698ccc-5668-4bb2-9e6f-5d44819153c8",
    "b068d61d-644e-4641-b267-7388fce50911",
    "051757ca-5ce4-4355-891c-a66cba6b6b89"
]

for track_id in track_ids:
    print(f"Checking Track: {track_id}")
    data = {
        "client": CLIENT_API_KEY,
        "meta": meta_flags,
        "trackid": track_id
    }
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(data).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    try:
        with urllib.request.urlopen(req) as res:
            res_data = json.loads(res.read().decode())
            results = res_data.get("results", [])
            for r in results:
                if "recordings" in r:
                    print(f" -> Found recordings for {track_id}!")
                    print(json.dumps(r["recordings"], indent=2))
                else:
                    print(f" -> No recordings for {track_id}")
    except Exception as e:
        print(f"Error checking {track_id}: {e}")
    print("-" * 40)

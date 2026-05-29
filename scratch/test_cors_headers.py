import requests

url = "https://res.cloudinary.com/dmi2mjb0c/video/upload/v1780072622/audiowave/yL2HovfxS3eXcvwdDPuv28Ipnor1/e2e_test_job_35333/Unidentified%20Song%2001.mp3"
resp = requests.head(url)
print("Status Code:", resp.status_code)
for k, v in resp.headers.items():
    if 'access-control' in k.lower() or 'cors' in k.lower() or 'origin' in k.lower():
        print(f"{k}: {v}")

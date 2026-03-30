import requests
import json
import sys

# ✅ Ensure output is UTF-8 for Korean
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

url = "http://127.0.0.1:8123/api/analyze"
data = {
    "url": "https://www.youtube.com/watch?v=4NRXx6nd6W4",
    "title": "Blinding Lights",
    "artist": "The Weeknd"
}
try:
    print(f"Sending request to {url} for VVS - Mirani...")
    r = requests.post(url, json=data, timeout=60)
    print(f"Response status: {r.status_code}")
    print(json.dumps(r.json(), indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Test failed: {e}")

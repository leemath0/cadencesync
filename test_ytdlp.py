import yt_dlp
import json
url = 'https://music.youtube.com/playlist?list=PL4fGSI1pDJn6jXS_Tv_N9B8Z0HTRVZBsV'
with yt_dlp.YoutubeDL({'extract_flat': 'in_playlist', 'quiet': True}) as ydl:
    info = ydl.extract_info(url, download=False)
    print(json.dumps({'title': info.get('title'), 'entries': info.get('entries', [])[:2]}, indent=2, ensure_ascii=False))
